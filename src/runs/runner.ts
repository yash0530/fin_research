import { z } from "zod";
import { type SqlDb } from "../db/migrate";
import { type Provider } from "../analyst/types";
import { getBudgetConfig, type BudgetConfig } from "./budget";
import { checkHardwareThrottling } from "./safety";
import { runDossierJob } from "../dossier/job";
import { activeSymbols, watchlistSymbols, listPositions } from "../db/queries";
import { completeJson } from "../analyst/llmjson";
import { diffFilings, type FilingDiffResult } from "../monitor/filing-diff";
import { requireUserAgent, EDGAR_LIMITER } from "../net/edgar";
import { type Fetcher } from "../net/fetchers";
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

// Filing-diff step artifacts. Each 200KB-truncated doc is diffed by the PURE
// core (src/monitor/filing-diff.ts); the LLM only summarizes already-detected
// changed paragraphs, quoting them with the accessionNo for provenance.
const FILING_DIFF_DOC_CAP = 200_000;

const FilingDiffSummarySchema = z.object({
  summary: z.string(),
  verdict: z.enum(["routine", "notable", "thesis-relevant"]),
});

export type FilingDiffStepResult = {
  symbol: string;
  form?: string;
  oldAccessionNo?: string;
  newAccessionNo?: string;
  filedAt?: string;
  diff?: FilingDiffResult;
  verdict?: "routine" | "notable" | "thesis-relevant";
  summary?: string;
  skipped?: string;
  error?: string;
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
  private fetchImpl: Fetcher;
  private userAgent: string | undefined;

  constructor(
    db: SqlDb,
    runId: string,
    providerFor: (role: AgentRole) => Provider,
    opts: {
      now?: () => number;
      execImpl?: (cmd: string) => string;
      sleepImpl?: (ms: number) => Promise<void>;
      platform?: string;
      /** Injectable HTTP fetch (filing-diff doc downloads). Defaults to global fetch. */
      fetchImpl?: Fetcher;
      /** EDGAR User-Agent; defaults to requireUserAgent() (env) at first use. */
      userAgent?: string;
    } = {},
  ) {
    this.db = db;
    this.runId = runId;
    this.providerFor = providerFor;
    this.now = opts.now ?? Date.now;
    this.fetchImpl =
      opts.fetchImpl ?? ((url, init) => fetch(url, init as RequestInit) as any);
    this.userAgent = opts.userAgent;
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
      // One resumable step per watchlist+portfolio symbol, budget-scaled.
      const symbols = this.filingDiffSymbols();
      if (symbols.length === 0) {
        steps.push({ name: "filing_diff_no_targets", payload: {} });
      } else {
        for (const symbol of symbols) {
          steps.push({ name: "filing_diff_symbol", payload: { symbol } });
        }
      }
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

    if (name === "filing_diff_no_targets") {
      return { text: "No watchlist or portfolio symbols to diff — add names to the watchlist first." };
    }

    if (name === "filing_diff_symbol") {
      // Never-crash: a failed symbol returns an error entry, not a thrown step.
      try {
        return await this.runFilingDiffForSymbol(payload.symbol as string);
      } catch (e: any) {
        console.warn(`[filing_diff] ${payload.symbol}: ${e?.message ?? e}`);
        return { symbol: payload.symbol, error: e?.message ?? String(e) } satisfies FilingDiffStepResult;
      }
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

  /** Watchlist + portfolio symbols (deduped), budget-scaled for the run. */
  private filingDiffSymbols(): string[] {
    const set = new Set<string>(watchlistSymbols(this.db));
    try {
      for (const p of listPositions(this.db)) set.add(p.symbol);
    } catch {
      // Position table missing — watchlist only
    }
    return Array.from(set).sort().slice(0, this.budget.maxTickers);
  }

  /**
   * Filing-diff for ONE symbol: fetch the two most recent 10-K (or 10-Q)
   * filings (200KB cap each), run the pure diff core, LLM-summarize ONLY the
   * changed paragraphs, and persist a FilingEvent row (kind "filing-diff",
   * severity = LLM verdict). Throws only for the caller's per-symbol catch.
   */
  private async runFilingDiffForSymbol(symbol: string): Promise<FilingDiffStepResult> {
    type FilingRow = { accessionNo: string; cik: string; primaryDoc: string | null; filedAt: string };
    const pick = (form: string): FilingRow[] =>
      this.db
        .prepare(
          'SELECT "accessionNo", "cik", "primaryDoc", "filedAt" FROM "EdgarFiling" ' +
            'WHERE "symbol" = ? AND "form" = ? AND "primaryDoc" IS NOT NULL ORDER BY "filedAt" DESC LIMIT 2',
        )
        .all(symbol, form) as FilingRow[];

    let form = "10-K";
    let filings = pick(form);
    if (filings.length < 2) {
      form = "10-Q";
      filings = pick(form);
    }
    if (filings.length < 2) {
      return { symbol, skipped: "fewer than two 10-K/10-Q filings on record" };
    }

    const [newer, older] = filings;
    const ua = this.userAgent ?? requireUserAgent();
    const fetchDoc = async (f: FilingRow): Promise<string> => {
      const cleanCik = f.cik.replace(/\D/g, "").replace(/^0+/, "");
      const accessionNoDashes = f.accessionNo.replace(/-/g, "");
      const url = `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${accessionNoDashes}/${f.primaryDoc}`;
      const res = await EDGAR_LIMITER.throttle(() =>
        this.fetchImpl(url, { headers: { "User-Agent": ua, "Accept-Encoding": "gzip" } }),
      );
      if (!res.ok) throw new Error(`EDGAR fetch ${f.accessionNo}: HTTP ${res.status}`);
      const text = await res.text();
      return text.length > FILING_DIFF_DOC_CAP ? text.slice(0, FILING_DIFF_DOC_CAP) : text;
    };

    const [oldText, newText] = [await fetchDoc(older), await fetchDoc(newer)];
    const diff = diffFilings(oldText, newText, symbol);

    let verdict: "routine" | "notable" | "thesis-relevant" = "routine";
    let summary = `No material paragraph-level changes between ${older.accessionNo} and ${newer.accessionNo} (boilerplate filtered: ${diff.boilerplateDropped}).`;

    if (diff.changed.length > 0) {
      const changedBlock = diff.changed
        .map(
          (c, i) =>
            `[${i + 1}] Section: ${c.section} (Jaccard ${c.jaccard})\nBEFORE (${older.accessionNo}): ${c.before.slice(0, 900)}\nAFTER (${newer.accessionNo}): ${c.after.slice(0, 900)}`,
        )
        .join("\n\n");
      try {
        const out = await completeJson(
          this.providerFor("narrator"),
          {
            system:
              "You summarize CHANGED paragraphs between two SEC filings of the same company. " +
              "Only describe what changed in the provided paragraphs — never invent facts or numbers. " +
              "Quote short phrases and cite the accession number they came from. " +
              'Return JSON: {"summary": string, "verdict": "routine"|"notable"|"thesis-relevant"}.',
            user: `Symbol: ${symbol}. Form: ${form}. Newer filing ${newer.accessionNo} (filed ${newer.filedAt}) vs older ${older.accessionNo} (filed ${older.filedAt}).\n\nChanged paragraphs (top ${diff.changed.length} of ${diff.changedCount}):\n\n${changedBlock}`,
          },
          FilingDiffSummarySchema,
        );
        verdict = out.data.verdict;
        summary = out.data.summary;
      } catch (e: any) {
        // LLM failure degrades to a deterministic summary — the diff still lands.
        verdict = "notable";
        summary =
          `${diff.changedCount} changed paragraph(s) in ${diff.changed.map((c) => c.section).join("; ")} ` +
          `between ${older.accessionNo} and ${newer.accessionNo}. (LLM summary unavailable: ${e?.message ?? e})`;
      }
    }

    this.db
      .prepare(
        'INSERT INTO "FilingEvent" ("symbol", "accessionNo", "form", "item", "kind", "headline", "snippet", "severity", "filedAt") ' +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
          'ON CONFLICT("accessionNo", "item") DO UPDATE SET ' +
          '"kind"=excluded.kind, "headline"=excluded.headline, "snippet"=excluded.snippet, "severity"=excluded.severity, "filedAt"=excluded.filedAt',
      )
      .run(
        symbol,
        newer.accessionNo,
        form,
        "diff",
        "filing-diff",
        `${form} diff vs ${older.accessionNo}: ${diff.changedCount} changed paragraph(s) — ${verdict}`,
        summary.slice(0, 600),
        verdict,
        newer.filedAt,
      );

    return {
      symbol,
      form,
      oldAccessionNo: older.accessionNo,
      newAccessionNo: newer.accessionNo,
      filedAt: newer.filedAt,
      diff,
      verdict,
      summary,
    };
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
      md += `### Filing Diff Batch Analysis\n\n`;
      const noTargets = steps.find(s => s.stepName === "filing_diff_no_targets");
      if (noTargets?.resultCheckpoint) {
        try {
          md += `${JSON.parse(noTargets.resultCheckpoint).text}\n\n`;
        } catch {
          // ignore
        }
      }
      const symbolSteps = steps.filter(s => s.stepName === "filing_diff_symbol" && s.resultCheckpoint);
      if (symbolSteps.length > 0) {
        md += `| Symbol | Form | Newer vs Older | Changed | Verdict |\n`;
        md += `| :--- | :--- | :--- | :--- | :--- |\n`;
        const details: string[] = [];
        for (const s of symbolSteps) {
          try {
            const r = JSON.parse(s.resultCheckpoint) as FilingDiffStepResult;
            if (r.skipped) {
              md += `| **${r.symbol}** | — | — | — | skipped: ${r.skipped} |\n`;
              continue;
            }
            if (r.error) {
              md += `| **${r.symbol}** | — | — | — | error: ${r.error} |\n`;
              continue;
            }
            md += `| **${r.symbol}** | ${r.form} | ${r.newAccessionNo} vs ${r.oldAccessionNo} | ${r.diff?.changedCount ?? 0} (boilerplate dropped: ${r.diff?.boilerplateDropped ?? 0}) | ${r.verdict} |\n`;
            let block = `#### ${r.symbol} — ${r.verdict}\n\n${r.summary}\n`;
            for (const c of r.diff?.changed ?? []) {
              block += `\n> **${c.section}** (Jaccard ${c.jaccard}, ${r.newAccessionNo})\n> Before: ${c.before.slice(0, 300)}\n> After: ${c.after.slice(0, 300)}\n`;
            }
            details.push(block);
          } catch {
            // ignore malformed checkpoint
          }
        }
        md += `\n${details.join("\n")}\n`;
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
