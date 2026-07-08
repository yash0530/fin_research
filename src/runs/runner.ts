import { type SqlDb } from "../db/migrate";
import { type Provider } from "../analyst/types";
import { getBudgetConfig, type BudgetConfig } from "./budget";
import { checkHardwareThrottling } from "./safety";
import { runDossierJob } from "../dossier/job";
import { activeSymbols, watchlistSymbols } from "../db/queries";
import { computeFScore, screenApplicability as fscoreApplicability } from "../screens/fscore";
import { computeAccruals } from "../screens/accruals";
import { computeDilution } from "../screens/dilution";
import { computeEarningsTrend } from "../screens/earnings-trend";
import { computeCohortCheapness } from "../screens/cohort";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type LlamaProfile } from "../config/llama";
import { type AgentRole } from "../config/settings";

// EV/EBIT computation helper copied from registry-live.ts
function computeEvToEbit(quarters: any[], marketCap: number | null): number | null {
  if (quarters.length < 4 || marketCap === null || marketCap <= 0) return null;
  const ttmQuarters = quarters.slice(-4);
  let ebitSum = 0;
  for (const q of ttmQuarters) {
    if (q.operatingIncome === null || q.operatingIncome === undefined) return null;
    ebitSum += q.operatingIncome;
  }
  if (ebitSum <= 0) return null;

  const latest = ttmQuarters[3];
  const debt = latest.totalDebt ?? 0;
  const cash = latest.cash ?? 0;
  const ev = marketCap + debt - cash;
  return ev / ebitSum;
}

export type StepInfo = {
  name: string;
  payload: any;
};

export class OnDemandResearchRunner {
  private db: SqlDb;
  private runId: string;
  private runType: string;
  private target: string;
  private budgetSeconds: number;
  private initialElapsedSeconds: number;
  private modelProfile: LlamaProfile;
  private budget: BudgetConfig;
  private providerFor: (role: AgentRole) => Provider;
  private now: () => number;
  private synthesisBuffer: number;
  private startTime: number = 0;
  private safetyOpts: {
    execImpl?: (cmd: string) => string;
    sleepImpl?: (ms: number) => Promise<void>;
    platform?: string;
  };

  constructor(
    db: SqlDb,
    runId: string,
    providerFor: (role: AgentRole) => Provider,
    opts: {
      now?: () => number;
      execImpl?: (cmd: string) => string;
      sleepImpl?: (ms: number) => Promise<void>;
      platform?: string;
    } = {},
  ) {
    this.db = db;
    this.runId = runId;
    this.providerFor = providerFor;
    this.now = opts.now ?? Date.now;
    this.safetyOpts = {
      execImpl: opts.execImpl,
      sleepImpl: opts.sleepImpl,
      platform: opts.platform,
    };

    const row = db.prepare('SELECT * FROM "ResearchRun" WHERE "id" = ?').get(runId) as any;
    if (!row) {
      throw new Error(`ResearchRun ID ${runId} not found in database.`);
    }

    this.runType = row.runType;
    this.target = row.target;
    this.budgetSeconds = row.budgetSeconds;
    this.initialElapsedSeconds = row.elapsedSeconds ?? 0;
    this.modelProfile = row.profile as LlamaProfile;
    this.budget = getBudgetConfig(this.runType, this.budgetSeconds);

    // reserve max(300s, 10% budget) synthesis buffer
    this.synthesisBuffer = Math.max(300, Math.floor(0.1 * this.budgetSeconds));
  }

  public async execute(): Promise<void> {
    this.startTime = this.now();

    // Mark running
    this.db.prepare(
      'UPDATE "ResearchRun" SET "status" = \'RUNNING\', "startedAt" = datetime(\'now\', \'utc\'), "updatedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?'
    ).run(this.runId);

    try {
      const steps = this.getOrCreateSteps();

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        // Wall clock check
        const currentElapsed = Math.floor((this.now() - this.startTime) / 1000) + this.initialElapsedSeconds;
        this.updateElapsed(currentElapsed);

        // Check user signals (PAUSING or CANCELLED)
        const runState = this.db.prepare('SELECT "status" FROM "ResearchRun" WHERE "id" = ?').get(this.runId) as { status: string } | undefined;
        if (runState?.status === "PAUSING") {
          await this.gracefulPause(steps, currentElapsed);
          return;
        }
        if (runState?.status === "CANCELLED") {
          await this.gracefulCancel(steps, currentElapsed);
          return;
        }

        // Budget breach check
        const remaining = this.budgetSeconds - currentElapsed;
        if (remaining <= this.synthesisBuffer) {
          console.warn(`Budget near exhaustion. Entering synthesis buffer.`);
          await this.gracefulTimeout(steps, currentElapsed);
          return;
        }

        if (step.status === "COMPLETED") {
          continue;
        }

        // Execute step
        this.db.prepare(
          'UPDATE "ResearchRunStep" SET "status" = \'RUNNING\', "startedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?'
        ).run(step.id);

        try {
          await checkHardwareThrottling(this.db, this.runId, this.safetyOpts);
          const result = await this.executeStep(step);
          this.db.prepare(
            'UPDATE "ResearchRunStep" SET "status" = \'COMPLETED\', "resultCheckpoint" = ?, "completedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?'
          ).run(JSON.stringify(result ?? {}), step.id);
          step.status = "COMPLETED";
          step.resultCheckpoint = JSON.stringify(result ?? {});
        } catch (e: any) {
          this.db.prepare(
            'UPDATE "ResearchRunStep" SET "status" = \'FAILED\', "completedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?'
          ).run(step.id);
          throw e;
        }
      }

      // Complete successfully
      const finalElapsed = Math.floor((this.now() - this.startTime) / 1000) + this.initialElapsedSeconds;
      await this.compileAndWriteReport(steps, "COMPLETED", finalElapsed);
    } catch (err: any) {
      const finalElapsed = Math.floor((this.now() - this.startTime) / 1000) + this.initialElapsedSeconds;
      this.db.prepare(
        'UPDATE "ResearchRun" SET "status" = \'FAILED\', "errorMessage" = ?, "completedAt" = datetime(\'now\', \'utc\'), "updatedAt" = datetime(\'now\', \'utc\'), "elapsedSeconds" = ? WHERE "id" = ?'
      ).run(err.message || String(err), finalElapsed, this.runId);
      try {
        const steps = this.getOrCreateSteps();
        await this.compileAndWriteReport(steps, "FAILED", finalElapsed, err.message || String(err));
      } catch {
        // ignore secondary failures during reporting
      }
      throw err;
    }
  }

  private updateElapsed(secs: number): void {
    this.db.prepare('UPDATE "ResearchRun" SET "elapsedSeconds" = ?, "updatedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?').run(secs, this.runId);
  }

  private getOrCreateSteps(): any[] {
    let rows = this.db.prepare('SELECT * FROM "ResearchRunStep" WHERE "runId" = ? ORDER BY "stepIndex" ASC').all(this.runId);
    if (rows.length === 0) {
      const planned = this.planSteps();
      const insert = this.db.prepare(
        'INSERT INTO "ResearchRunStep" ("id", "runId", "stepIndex", "stepName", "status", "payload") VALUES (?, ?, ?, ?, \'PENDING\', ?)'
      );
      this.db.exec("BEGIN");
      try {
        planned.forEach((p, idx) => {
          insert.run(`${this.runId}_step_${idx}`, this.runId, idx, p.name, JSON.stringify(p.payload));
        });
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
      rows = this.db.prepare('SELECT * FROM "ResearchRunStep" WHERE "runId" = ? ORDER BY "stepIndex" ASC').all(this.runId);
    }
    return rows;
  }

  private planSteps(): StepInfo[] {
    const steps: StepInfo[] = [];
    if (this.runType === "ticker_dossier") {
      steps.push({ name: "dossier_debate", payload: { ticker: this.target } });
    } else if (this.runType === "theme_sweep") {
      steps.push({ name: "screens_rank", payload: { theme: this.target } });
      steps.push({ name: "theme_summaries", payload: { theme: this.target } });
    } else if (this.runType === "watchlist_reunderwrite") {
      steps.push({ name: "reunderwrite_screens", payload: {} });
      steps.push({ name: "reunderwrite_summaries", payload: {} });
    } else if (this.runType === "filing_diff") {
      steps.push({ name: "filing_diff_not_implemented", payload: {} });
    } else if (this.runType === "open_question") {
      steps.push({ name: "gather_evidence", payload: { question: this.target } });
      steps.push({ name: "open_debate", payload: { question: this.target } });
    } else {
      // Fallback
      steps.push({ name: "fallback_step", payload: {} });
    }
    return steps;
  }

  private async executeStep(step: any): Promise<any> {
    const payload = JSON.parse(step.payload || "{}");
    const name = step.stepName;

    if (name === "dossier_debate") {
      // execute runDossierJob
      const res = await runDossierJob(this.db, [this.target], {
        providerFor: this.providerFor,
        log: (m) => console.log(m),
        now: this.now,
        narrate: true,
      });
      return res;
    }

    if (name === "screens_rank") {
      // run screens over theme tickers
      const symbols = this.getThemeTickers(this.target);
      const results = this.runScreensForTickers(symbols);
      return { ranked: results };
    }

    if (name === "theme_summaries") {
      // call LLM summary
      const prevStep = this.db.prepare('SELECT "resultCheckpoint" FROM "ResearchRunStep" WHERE "runId" = ? AND "stepName" = \'screens_rank\'').get(this.runId) as { resultCheckpoint: string } | undefined;
      const prevData = prevStep?.resultCheckpoint ? JSON.parse(prevStep.resultCheckpoint) : { ranked: [] };
      const rankedList = prevData.ranked.slice(0, this.budget.maxTickers).map((r: any) => `- ${r.symbol}: score=${r.fscore} (cheap=${r.cheap}, accruals=${r.accruals})`).join("\n");
      const prompt = {
        system: "You are an investment analyst compiling a theme sweep report.",
        user: `Please summarize the findings for the following theme: ${this.target}.\nHere are the screened and ranked tickers:\n${rankedList}\n\nProvide a concise 1-page summary of key insights and top ideas.`
      };
      const p = this.providerFor("narrator");
      const llmResult = await p.complete(prompt);
      return { summary: llmResult.text };
    }

    if (name === "reunderwrite_screens") {
      const symbols = watchlistSymbols(this.db);
      const results = this.runScreensForTickers(symbols);
      return { screened: results };
    }

    if (name === "reunderwrite_summaries") {
      const prevStep = this.db.prepare('SELECT "resultCheckpoint" FROM "ResearchRunStep" WHERE "runId" = ? AND "stepName" = \'reunderwrite_screens\'').get(this.runId) as { resultCheckpoint: string } | undefined;
      const prevData = prevStep?.resultCheckpoint ? JSON.parse(prevStep.resultCheckpoint) : { screened: [] };
      const summaries: Record<string, string> = {};
      const p = this.providerFor("narrator");
      for (const item of prevData.screened.slice(0, this.budget.maxTickers)) {
        const prompt = {
          system: "You are an investment analyst reviewing a watchlisted ticker.",
          user: `Ticker: ${item.symbol}\nF-Score: ${item.fscore}\nAccruals: ${item.accruals}\nDilution: ${item.dilution}\n\nPlease write a concise thesis re-underwrite summary.`
        };
        const llmResult = await p.complete(prompt);
        summaries[item.symbol] = llmResult.text;
      }
      return { summaries };
    }

    if (name === "filing_diff_not_implemented") {
      return { text: "Filing Diff system is not yet implemented. Placeholder step until Phase 8 lands." };
    }

    if (name === "gather_evidence") {
      const words = this.target.split(/\s+/).filter(w => w.length > 3).map(w => `%${w}%`);
      let evidence = "";
      if (words.length > 0) {
        const news = this.db.prepare('SELECT "title", "snippet" FROM "NewsItem" WHERE "title" LIKE ? OR "snippet" LIKE ? LIMIT 5')
          .all(words[0], words[0]) as { title: string; snippet: string }[];
        evidence = news.map(n => `- News: ${n.title} - ${n.snippet}`).join("\n");
      }
      if (!evidence) {
        evidence = "No specific DB evidence found for: " + this.target;
      }
      return { evidence };
    }

    if (name === "open_debate") {
      const prevStep = this.db.prepare('SELECT "resultCheckpoint" FROM "ResearchRunStep" WHERE "runId" = ? AND "stepName" = \'gather_evidence\'').get(this.runId) as { resultCheckpoint: string } | undefined;
      const prevData = prevStep?.resultCheckpoint ? JSON.parse(prevStep.resultCheckpoint) : { evidence: "" };
      const prompt = {
        system: "You are a research analyst answering an open-ended investment question using the provided database evidence.",
        user: `Question: ${this.target}\n\nEvidence gathered:\n${prevData.evidence}\n\nPlease analyze and provide a structured pros/cons report.`
      };
      const p = this.providerFor("judge");
      const llmResult = await p.complete(prompt);
      return { answer: llmResult.text };
    }

    return { success: true };
  }

  private getThemeTickers(theme: string): string[] {
    let tickers = this.db.prepare('SELECT "symbol" FROM "TickerSector" WHERE "sectorCode" = ?').all(theme).map((r: any) => r.symbol);
    if (tickers.length === 0) {
      tickers = this.db.prepare('SELECT "symbol" FROM "TickerSector" WHERE "sectorCode" LIKE ?').all(`%${theme}%`).map((r: any) => r.symbol);
    }
    if (tickers.length === 0) {
      tickers = activeSymbols(this.db);
    }
    return tickers;
  }

  private runScreensForTickers(symbols: string[]): any[] {
    const results: any[] = [];
    const activeSet = new Set(activeSymbols(this.db));
    const targetSyms = symbols.filter(s => activeSet.has(s));

    // Gather cohort cheapness EV/EBIT for active universe first
    const cohortInputs: { symbol: string; sectorCode: string; evToEbit: number | null }[] = [];
    for (const sym of activeSet) {
      try {
        const gicsRow = this.db.prepare('SELECT "sectorCode" FROM "TickerSector" WHERE "symbol"=? AND "sectorCode" LIKE \'g_%\' LIMIT 1').get(sym) as { sectorCode: string } | undefined;
        const sectorCode = gicsRow?.sectorCode;
        if (!sectorCode) continue;

        const quarters = this.db.prepare('SELECT * FROM "FundamentalsQuarter" WHERE "symbol"=? ORDER BY "periodEnd" ASC').all(sym) as any[];
        const tickerRow = this.db.prepare('SELECT "marketCap" FROM "Ticker" WHERE "symbol"=?').get(sym) as { marketCap: number | null } | undefined;
        const marketCap = tickerRow?.marketCap ?? null;
        const evToEbit = computeEvToEbit(quarters, marketCap);
        cohortInputs.push({ symbol: sym, sectorCode, evToEbit });
      } catch {
        // ignore
      }
    }
    const cohortCheap = computeCohortCheapness(cohortInputs).cheap;

    for (const sym of targetSyms) {
      try {
        const quarters = this.db.prepare('SELECT * FROM "FundamentalsQuarter" WHERE "symbol"=? ORDER BY "periodEnd" ASC').all(sym) as any[];
        const fscore = computeFScore(quarters).score;
        const accruals = computeAccruals(quarters).verdict;
        const dilution = computeDilution(quarters).verdict;
        const cheap = cohortCheap.has(sym);
        results.push({ symbol: sym, fscore, accruals, dilution, cheap });
      } catch {
        // fallback
        results.push({ symbol: sym, fscore: 0, accruals: "unknown", dilution: "unknown", cheap: false });
      }
    }

    // Rank: Passes gates / higher FScore first
    results.sort((a, b) => {
      const aPass = a.fscore >= 7 && a.accruals === "pass" && a.dilution === "pass" && a.cheap;
      const bPass = b.fscore >= 7 && b.accruals === "pass" && b.dilution === "pass" && b.cheap;
      if (aPass && !bPass) return -1;
      if (!aPass && bPass) return 1;
      return b.fscore - a.fscore;
    });

    return results;
  }

  private async gracefulPause(steps: any[], elapsed: number): Promise<void> {
    this.db.prepare(
      'UPDATE "ResearchRun" SET "status" = \'PAUSED\', "elapsedSeconds" = ?, "completedAt" = datetime(\'now\', \'utc\'), "updatedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?'
    ).run(elapsed, this.runId);
    await this.compileAndWriteReport(steps, "PAUSED", elapsed);
  }

  private async gracefulCancel(steps: any[], elapsed: number): Promise<void> {
    this.db.prepare(
      'UPDATE "ResearchRun" SET "status" = \'CANCELLED\', "elapsedSeconds" = ?, "completedAt" = datetime(\'now\', \'utc\'), "updatedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?'
    ).run(elapsed, this.runId);
    // Mark pending steps as SKIPPED
    this.db.prepare(
      'UPDATE "ResearchRunStep" SET "status" = \'SKIPPED\' WHERE "runId" = ? AND "status" = \'PENDING\''
    ).run(this.runId);
    await this.compileAndWriteReport(steps, "CANCELLED", elapsed);
  }

  private async gracefulTimeout(steps: any[], elapsed: number): Promise<void> {
    this.db.prepare(
      'UPDATE "ResearchRun" SET "status" = \'TIMEOUT_GRACEFUL\', "elapsedSeconds" = ?, "completedAt" = datetime(\'now\', \'utc\'), "updatedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?'
    ).run(elapsed, this.runId);
    // Mark pending steps as SKIPPED
    this.db.prepare(
      'UPDATE "ResearchRunStep" SET "status" = \'SKIPPED\' WHERE "runId" = ? AND "status" = \'PENDING\''
    ).run(this.runId);
    await this.compileAndWriteReport(steps, "TIMEOUT_GRACEFUL", elapsed);
  }

  private async compileAndWriteReport(
    steps: any[],
    status: string,
    elapsed: number,
    errMessage?: string
  ): Promise<void> {
    const reportPath = `data/research/${this.runId}.md`;
    mkdirSync(dirname(reportPath), { recursive: true });

    let md = `# Research Run Report: ${this.runId}\n\n`;
    md += `- **Run Type**: ${this.runType}\n`;
    md += `- **Target**: ${this.target}\n`;
    md += `- **Profile**: ${this.modelProfile}\n`;
    md += `- **Status**: ${status}\n`;
    md += `- **Duration**: ${elapsed}s / ${this.budgetSeconds}s\n`;
    md += `- **Completed At**: ${new Date().toISOString()}\n`;
    if (errMessage) {
      md += `- **Error**: ${errMessage}\n`;
    }
    md += `\n## Steps Execution Trace\n\n`;
    md += `| Step | Name | Status | Started At | Completed At |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    steps.forEach((s, idx) => {
      const stepRow = this.db.prepare('SELECT * FROM "ResearchRunStep" WHERE "id" = ?').get(s.id) as any;
      const sName = stepRow?.stepName || s.stepName;
      const sStatus = stepRow?.status || s.status;
      const sStart = stepRow?.startedAt || "";
      const sEnd = stepRow?.completedAt || "";
      md += `| ${idx} | ${sName} | ${sStatus} | ${sStart} | ${sEnd} |\n`;
    });

    md += `\n## Research Findings\n\n`;

    // format findings based on runType
    if (this.runType === "ticker_dossier") {
      const storyRow = this.db.prepare('SELECT * FROM "StoryPage" WHERE "symbol" = ? ORDER BY "dossierId" DESC LIMIT 1').get(this.target) as { title: string; storyJson: string; narrativeJson: string | null } | undefined;
      if (storyRow) {
        md += `### Dossier Story Page: ${storyRow.title}\n\n`;
        try {
          const data = JSON.parse(storyRow.storyJson);
          if (data.verdict) {
            md += `#### Verdict\n- **Recommendation**: ${data.verdict.recommendation}\n- **Conviction**: ${data.verdict.conviction}\n- **Size**: ${data.verdict.sizePct}%\n- **Rationale**: ${data.verdict.rationale}\n\n`;
          }
          if (data.bullCase) {
            md += `#### Bull Case\n${data.bullCase.thesis}\n\n`;
          }
          if (data.bearCase) {
            md += `#### Bear Case\n${data.bearCase.thesis}\n\n`;
          }
          if (data.judge) {
            md += `#### Judge Assessment\n${data.judge.rationale}\n\n`;
          }
        } catch {
          // ignore parsing error
        }
        if (storyRow.narrativeJson) {
          try {
            const narrative = JSON.parse(storyRow.narrativeJson);
            md += `#### Narrative\n${narrative.prose || narrative.narrative || storyRow.narrativeJson}\n\n`;
          } catch {
            md += `#### Narrative\n${storyRow.narrativeJson}\n\n`;
          }
        }
      } else {
        md += `No dossier story page generated yet.\n`;
      }
    } else if (this.runType === "theme_sweep") {
      const rankStep = steps.find(s => s.stepName === "screens_rank");
      const summaryStep = steps.find(s => s.stepName === "theme_summaries");

      if (rankStep && rankStep.resultCheckpoint) {
        try {
          const data = JSON.parse(rankStep.resultCheckpoint);
          md += `### Ranked Theme Tickers (${this.target})\n\n`;
          md += `| Symbol | F-Score | Low Accruals | No Dilution | Cheap Cohort |\n`;
          md += `| :--- | :--- | :--- | :--- | :--- |\n`;
          data.ranked.forEach((r: any) => {
            md += `| **${r.symbol}** | ${r.fscore} | ${r.accruals} | ${r.dilution} | ${r.cheap ? "yes" : "no"} |\n`;
          });
          md += `\n`;
        } catch {
          // ignore
        }
      }
      if (summaryStep && summaryStep.resultCheckpoint) {
        try {
          const data = JSON.parse(summaryStep.resultCheckpoint);
          md += `### Theme Sweep Summary\n\n${data.summary}\n\n`;
        } catch {
          // ignore
        }
      }
    } else if (this.runType === "watchlist_reunderwrite") {
      const rankStep = steps.find(s => s.stepName === "reunderwrite_screens");
      const summaryStep = steps.find(s => s.stepName === "reunderwrite_summaries");

      if (rankStep && rankStep.resultCheckpoint) {
        try {
          const data = JSON.parse(rankStep.resultCheckpoint);
          md += `### Watchlist Tickers Screened\n\n`;
          md += `| Symbol | F-Score | Low Accruals | No Dilution | Cheap Cohort |\n`;
          md += `| :--- | :--- | :--- | :--- | :--- |\n`;
          data.screened.forEach((r: any) => {
            md += `| **${r.symbol}** | ${r.fscore} | ${r.accruals} | ${r.dilution} | ${r.cheap ? "yes" : "no"} |\n`;
          });
          md += `\n`;
        } catch {
          // ignore
        }
      }
      if (summaryStep && summaryStep.resultCheckpoint) {
        try {
          const data = JSON.parse(summaryStep.resultCheckpoint);
          md += `### Thesis Re-Underwrites\n\n`;
          Object.entries(data.summaries).forEach(([sym, text]) => {
            md += `#### ${sym}\n${text}\n\n`;
          });
        } catch {
          // ignore
        }
      }
    } else if (this.runType === "filing_diff") {
      const step = steps.find(s => s.stepName === "filing_diff_not_implemented");
      if (step && step.resultCheckpoint) {
        try {
          const data = JSON.parse(step.resultCheckpoint);
          md += `### Filing Diff Batch Analysis\n\n${data.text}\n\n`;
        } catch {
          // ignore
        }
      }
    } else if (this.runType === "open_question") {
      const evidenceStep = steps.find(s => s.stepName === "gather_evidence");
      const debateStep = steps.find(s => s.stepName === "open_debate");

      if (evidenceStep && evidenceStep.resultCheckpoint) {
        try {
          const data = JSON.parse(evidenceStep.resultCheckpoint);
          md += `### Gathered Evidence\n\n${data.evidence}\n\n`;
        } catch {
          // ignore
        }
      }
      if (debateStep && debateStep.resultCheckpoint) {
        try {
          const data = JSON.parse(debateStep.resultCheckpoint);
          md += `### Question Analysis Answer\n\n${data.answer}\n\n`;
        } catch {
          // ignore
        }
      }
    }

    writeFileSync(reportPath, md, "utf8");

    // Update database row
    this.db.prepare(
      'UPDATE "ResearchRun" SET "status" = ?, "artifactPath" = ?, "completedAt" = datetime(\'now\', \'utc\'), "updatedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?'
    ).run(status, reportPath, this.runId);
  }
}
