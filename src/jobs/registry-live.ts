// Shared LIVE job registry — the single code path for both the job CLI
// (scripts/job.ts) and the scheduler daemon (scripts/scheduler.ts). It owns:
//   - env + DB open (loadDotEnv / databaseFile / openDb), mirroring scripts/seed.ts
//   - the LIVE fetchers/providers (yahoo2 / Stooq / EDGAR / HttpProvider), built
//     lazily inside each job's `run` so importing this module — and `--list` — stay
//     offline (no DB, no network)
//   - buildLiveRegistry(db): the runnable job entries, db bound in
//   - jobCatalog(): name+describe metadata for `--list` WITHOUT opening the DB
//   - drainDossierQueueLive(db): the scheduler's idle-tick dossier drain
//     (recoverStale → live drain, one at a time, respecting the llama single-flight lock)
//
// Extracted verbatim from the old scripts/job.ts so CLI behavior is unchanged.

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import type { SqlDb } from "../db/migrate";
import { activeSymbols, watchlistSymbols, symbolsWithCik, insertJobRun, type FundamentalsQuarterRow } from "../db/queries";
import {
  backfillPrices10y,
  backfillFundamentals,
  backfillEdgarIndex,
  backfillEdgarFacts,
  parseCompanyTickers,
  type BackfillSummary,
} from "./backfill";
import { parseCompanyFacts, type CompanyFacts } from "../net/edgar-facts";
import { runStatsJob } from "./stats";
import { runNewsJob, type NewsQuery } from "./news";
import { runEarningsJob } from "./earnings";
import { runOvernight, runPricesHealJob, runDigestJob } from "./overnight";
import { runChain } from "./runner";
import { runBackupJob } from "./backup";
import { runBuyListJob } from "./buylist";
import { runOutcomesJob } from "./outcomes";
import { runUniverseCheck } from "./universe";
import { runIntegrityJob } from "./integrity";
import { runBacktestJob } from "./backtest";
import { runPortfolioCheck } from "./portfolio";
import { runRulesJob } from "../rules/engine";
import { TRIPWIRES } from "../config/tripwires";
import { AI_INFRA_SEEDS, AI_INFRA_SYMBOLS } from "../config/sectors";
import {
  fetchDailyBars,
  fetchQuoteBatch,
  fetchQuarterlyFundamentals,
  fetchEarningsDates,
  type DailyBar,
} from "../net/yahoo2";
import { routeDailyBars, fetchStooqDaily, type HttpResponse } from "../net/route";
import { fetchSubmissions, type Fetcher } from "../net/fetchers";
import { requireUserAgent, EDGAR_LIMITER, type EdgarFilingRow } from "../net/edgar";
import { defaultClient } from "../net/yahoo2";
import { HttpProvider, type FetchLike } from "../analyst/http-provider";
import { resolveProfile, type AgentRole } from "../config/settings";
import type { Provider } from "../analyst/types";
import { runDossierJob, runStoryBackfillJob } from "../dossier/job";
import { recoverStale } from "../dossier/queue";
import { seedCampaign } from "../dossier/campaign";
import { SqliteDossierStore } from "../db/sqlite-store";
import { reconcileRuns } from "../runs/reconcile";
import { OnDemandResearchRunner } from "../runs/runner";
import { createResearchRun } from "../runs/create";
import { getBudgetConfig } from "../runs/budget";
import type { LiveFetchers } from "../tools/factory";
import { computeFScore, screenApplicability } from "../screens/fscore";
import { computeAccruals } from "../screens/accruals";
import { computeDilution } from "../screens/dilution";
import { computeCohortCheapness } from "../screens/cohort";
import { computeEvToEbit as evToEbit } from "../screens/ev";
import { mergeQuarters } from "../screens/merge-quarters";
import { computeEarningsTrend } from "../screens/earnings-trend";
import { fetchForm4 } from "../net/edgar-form4";
import { checkInsiderCluster } from "../screens/insider-cluster";
import { classify8k } from "../screens/eightk-classify";
import { computeBankQuality } from "../screens/bank-quality";
import { computeReitQuality } from "../screens/reit-quality";
import { detectSpinoff } from "../screens/spinoff-detect";
import { SUPERINVESTORS } from "../config/superinvestors";
import { fetch13FLatest } from "../net/edgar-13f";
import { computeSuperinvestorOverlap } from "../screens/superinvestor-overlap";


function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|co|corp|corporation|incorporated|ltd|limited|llc|lp|plc|class a|class b|class c|shares|shs|common stock|common|and)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function matchesFuzzy(name1: string, name2: string): boolean {
  const n1 = normalizeCompanyName(name1);
  const n2 = normalizeCompanyName(name2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  if (n1.length >= 4 && n2.length >= 4) {
    if (n1.startsWith(n2) || n2.startsWith(n1)) return true;
  }
  return false;
}

function computeEvToEbit(quarters: any[], marketCap: number | null): number | null {
  return evToEbit(quarters, marketCap).evToEbit;
}

// ── env + DB open (mirrors scripts/seed.ts) ──────────────────────────────────

/** Load simple KEY="value" pairs from .env into process.env (non-overriding).
 *  Jobs need more than DATABASE_URL (e.g. EDGAR_USER_AGENT for edgar_index). */
export function loadDotEnv(): void {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    process.env[key] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function databaseFile(): string {
  const url = process.env.DATABASE_URL;
  return (url ?? "file:./data/engine.db").replace(/^file:/, "");
}

export function openDb(): SqlDb {
  const file = databaseFile();
  mkdirSync(dirname(file) || ".", { recursive: true });
  // Load node:sqlite lazily via require so importing this module stays clean under
  // vitest's transform (bare `node:sqlite` ESM specifier isn't resolvable there).
  const nodeRequire = createRequire(import.meta.url);
  const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
  const db = new DatabaseSync(file) as unknown as SqlDb;
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA busy_timeout=8000;");
  return db;
}

// ── live fetchers (built lazily so --list is offline) ────────────────────────

const httpFetch: Fetcher = (url, init) => fetch(url, init as RequestInit) as unknown as Promise<HttpResponse>;

/** Daily bars via the provider chain (yahoo2 → Stooq). Throws only when BOTH are empty. */
async function routedBars(symbol: string, period1: Date): Promise<DailyBar[]> {
  const routed = await routeDailyBars(symbol, period1, {
    yahoo2: (s, p) => fetchDailyBars(s, p),
    stooq: (s) => fetchStooqDaily(s, (url) => fetch(url) as unknown as Promise<HttpResponse>),
  });
  if (routed.rows.length === 0 && routed.error) throw new Error(routed.error);
  return routed.rows;
}

async function edgarFilings(cik: string, symbol: string): Promise<EdgarFilingRow[]> {
  const ua = requireUserAgent();
  return fetchSubmissions(cik, symbol, httpFetch, ua, EDGAR_LIMITER);
}

async function fetchCikMap(): Promise<Record<string, string>> {
  const ua = requireUserAgent();
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": ua, "Accept-Encoding": "gzip" },
  });
  if (!res.ok) throw new Error(`company_tickers.json: HTTP ${res.status}`);
  return parseCompanyTickers(await res.json());
}

/** Deep XBRL fundamentals for one CIK (shares the 8 req/s EDGAR bucket). */
async function fetchEdgarFacts(cik: string, symbol: string): Promise<FundamentalsQuarterRow[]> {
  const ua = requireUserAgent();
  return EDGAR_LIMITER.throttle(async () => {
    const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: { "User-Agent": ua, "Accept-Encoding": "gzip" },
    });
    if (res.status === 404) return []; // no XBRL facts for this issuer
    if (!res.ok) throw new Error(`companyfacts CIK${cik}: HTTP ${res.status}`);
    return parseCompanyFacts(symbol, (await res.json()) as CompanyFacts);
  });
}

function newsQueries(db: SqlDb): NewsQuery[] {
  const queries: NewsQuery[] = [];
  for (const s of AI_INFRA_SEEDS) {
    if (s.newsQuery.trim()) queries.push({ q: s.newsQuery, sectorCode: s.code });
  }
  for (const symbol of watchlistSymbols(db)) queries.push({ q: `${symbol} stock`, symbol });
  return queries;
}

function earningsSymbols(db: SqlDb): string[] {
  return Array.from(new Set([...watchlistSymbols(db), ...AI_INFRA_SYMBOLS]));
}

// ── dossier LIVE wiring (provider + fetchers, built lazily) ──────────────────

/** Live LLM provider per agent role: HttpProvider over resolveProfile(role). */
function liveProviderFor(role: AgentRole): Provider {
  const profile = resolveProfile(role);
  const apiKey = profile.apiKeyEnv ? process.env[profile.apiKeyEnv] : undefined;
  const fetchImpl: FetchLike = (url, init) =>
    fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>;
  return new HttpProvider(profile, { fetchImpl, ...(apiKey ? { apiKey } : {}) });
}

/** Live tool fetchers wired to the existing yahoo2 adapters (network-bearing tools
 *  without an adapter degrade to low-confidence results — never crash the debate). */
function liveFetchers(): LiveFetchers {
  return {
    quotes: (symbols) => fetchQuoteBatch(symbols).then((r) => r.rows),
    ownershipJson: (symbol) =>
      defaultClient().quoteSummary(symbol, {
        modules: ["majorHoldersBreakdown", "institutionOwnership"],
      }),
  };
}

// ── registry ──────────────────────────────────────────────────────────────────

export type JobOutcome = { ok: boolean; detail: string };
/** Optional per-invocation args beyond the symbol set (e.g. the story backfill's
 *  target dossier id). Kept optional so existing callers (the scheduler) are unchanged. */
export type JobRunOpts = {
  dossierId?: string;
  force?: boolean;
  runId?: string;
  runType?: string;
  runTarget?: string;
  budgetMin?: number;
};
/** A runnable job: db is bound in at build time; symbols + opts are per-call. */
export type JobEntry = { name: string; describe: string; run: (symbols?: string[], opts?: JobRunOpts) => Promise<JobOutcome> };

/** Internal shape: `run` takes the db explicitly so jobCatalog() can list without one. */
type JobDef = { name: string; describe: string; run: (db: SqlDb, symbols?: string[], opts?: JobRunOpts) => Promise<JobOutcome> };

const backfillOutcome = (label: string, s: BackfillSummary): JobOutcome => ({
  ok: s.errors === 0,
  detail: `${label}: done=${s.done} errors=${s.errors} skipped=${s.skipped} rows=${s.rows}`,
});

const JOB_DEFS: JobDef[] = [
  {
    name: "prices10y",
    describe: "Resumable ~10y daily-price backfill (yahoo2 → Stooq) into Price.",
    run: async (db, symbols, opts) =>
      backfillOutcome("prices10y", await backfillPrices10y(db, { symbols: symbols ?? activeSymbols(db), fetchBars: routedBars, force: opts?.force })),
  },
  {
    name: "fundamentals",
    describe: "Resumable quarterly-fundamentals backfill (yahoo2) into FundamentalsQuarter.",
    run: async (db, symbols) =>
      backfillOutcome(
        "fundamentals",
        await backfillFundamentals(db, {
          symbols: symbols ?? activeSymbols(db),
          fetchFundamentals: (s) => fetchQuarterlyFundamentals(s).then((r) => r.rows),
        }),
      ),
  },
  {
    name: "edgar_index",
    describe: "Map CIKs → Ticker.cik, then backfill EDGAR submissions into EdgarFiling.",
    run: async (db, symbols) => {
      const cikMap = await fetchCikMap();
      return backfillOutcome(
        "edgar_index",
        await backfillEdgarIndex(db, { symbols: symbols ?? activeSymbols(db), cikMap, fetchFilings: edgarFilings }),
      );
    },
  },
  {
    name: "edgar_facts",
    describe: "Deep quarterly fundamentals from EDGAR XBRL companyfacts (years) → FundamentalsQuarter.",
    run: async (db, symbols) => {
      const all = symbolsWithCik(db);
      const ciks = symbols ? all.filter((c) => symbols.includes(c.symbol)) : all;
      return backfillOutcome("edgar_facts", await backfillEdgarFacts(db, { ciks, fetchFacts: fetchEdgarFacts }));
    },
  },
  {
    name: "stats",
    describe: "Refresh Ticker stat columns from batched yahoo2 quote() (≤100/req).",
    run: async (db, symbols) => {
      const detail = await runStatsJob(db, {
        symbols: symbols ?? activeSymbols(db),
        fetchQuotes: (syms) => fetchQuoteBatch(syms).then((r) => r.rows),
      });
      return { ok: true, detail };
    },
  },
  {
    name: "news",
    describe: "Google News RSS per AI-infra sector + watchlist symbol → NewsItem (deduped).",
    run: async (db) => {
      const detail = await runNewsJob(db, {
        queries: newsQueries(db),
        fetchRss: (url) => fetch(url).then((r) => r.text()),
      });
      return { ok: true, detail };
    },
  },
  {
    name: "earnings",
    describe: "Upcoming earnings dates (yahoo2 calendarEvents) → Catalyst upserts.",
    run: async (db, symbols) => {
      const detail = await runEarningsJob(db, {
        symbols: symbols ?? earningsSymbols(db),
        fetchEarnings: (s) => fetchEarningsDates(s).then((r) => r.rows.map((x) => ({ symbol: x.symbol, d: x.d }))),
      });
      return { ok: true, detail };
    },
  },
  {
    name: "rules",
    describe: "Evaluate tripwires against stored prices/series → RuleEvent fires.",
    run: async (db) => ({ ok: true, detail: await runRulesJob(db, TRIPWIRES) }),
  },
  {
    name: "digest",
    describe: "Synthesize the deterministic morning digest from stored facts → Digest.",
    run: async (db) => ({ ok: true, detail: await runDigestJob(db) }),
  },
  {
    name: "overnight",
    describe: "The full chain: prices-heal → stats → news → earnings → rules → digest.",
    run: async (db, symbols) => {
      const syms = symbols ?? activeSymbols(db);
      const summary = await runOvernight(db, {
        pricesHeal: () => runPricesHealJob(db, { symbols: syms, fetchBars: routedBars }),
        stats: () => runStatsJob(db, { symbols: syms, fetchQuotes: (s) => fetchQuoteBatch(s).then((r) => r.rows) }),
        news: () => runNewsJob(db, { queries: newsQueries(db), fetchRss: (url) => fetch(url).then((r) => r.text()) }),
        earnings: () =>
          runEarningsJob(db, {
            symbols: earningsSymbols(db),
            fetchEarnings: (s) => fetchEarningsDates(s).then((r) => r.rows.map((x) => ({ symbol: x.symbol, d: x.d }))),
          }),
        outcomes: () => Promise.resolve(runOutcomesJob(db)),
        rules: () => runRulesJob(db, TRIPWIRES),
        digest: () => runDigestJob(db),
      });
      const lines = summary.results.map((r) => `  ${r.ok ? "✓" : "✗"} ${r.job}: ${r.detail}`).join("\n");
      return { ok: summary.failed === 0, detail: `overnight — ok=${summary.ok} failed=${summary.failed}\n${lines}` };
    },
  },
  {
    name: "refresh_data",
    describe: "Refresh market data only, NO model: prices-heal → stats → news → earnings → rules.",
    run: async (db, symbols) => {
      const syms = symbols ?? activeSymbols(db);
      const summary = await runChain(
        [
          { name: "prices-heal", fn: () => runPricesHealJob(db, { symbols: syms, fetchBars: routedBars }) },
          { name: "stats", fn: () => runStatsJob(db, { symbols: syms, fetchQuotes: (s) => fetchQuoteBatch(s).then((r) => r.rows) }) },
          { name: "news", fn: () => runNewsJob(db, { queries: newsQueries(db), fetchRss: (url) => fetch(url).then((r) => r.text()) }) },
          {
            name: "earnings",
            fn: () =>
              runEarningsJob(db, {
                symbols: earningsSymbols(db),
                fetchEarnings: (s) => fetchEarningsDates(s).then((r) => r.rows.map((x) => ({ symbol: x.symbol, d: x.d }))),
              }),
          },
          { name: "rules", fn: () => runRulesJob(db, TRIPWIRES) },
        ],
        (r) => insertJobRun(db, { job: r.job, ok: r.ok, detail: r.detail }),
      );
      const lines = summary.results.map((r) => `  ${r.ok ? "✓" : "✗"} ${r.job}: ${r.detail}`).join("\n");
      return { ok: summary.failed === 0, detail: `refresh_data — ok=${summary.ok} failed=${summary.failed}\n${lines}` };
    },
  },
  {
    name: "dossier",
    describe: "Deep-dive: enqueue symbols (deduped) then run the live multi-agent debate one at a time.",
    run: async (db, symbols) => {
      const { enqueued, ran } = await runDossierJob(db, symbols, {
        providerFor: liveProviderFor,
        live: liveFetchers(),
        narrate: true,
        log: (msg) => console.log(msg),
      });
      const done = ran.filter((r) => r.status === "done").length;
      const failed = ran.filter((r) => r.status === "failed").length;
      const skipped = enqueued.filter((e) => !e.enqueued).length;
      const lines = ran.map(
        (r) =>
          `  ${r.status === "done" ? "✓" : "✗"} ${r.symbol}: ${r.recommendation ?? r.status}` +
          `${r.conviction ? `/${r.conviction}` : ""}` +
          `${r.governedSizePct !== undefined ? ` size ${r.judgeSizePct}%→${r.governedSizePct}%` : ""}` +
          ` (${r.stages} stages, ${r.wallClockSec.toFixed(1)}s)${r.error ? ` — ${r.error}` : ""}`,
      );
      return {
        ok: failed === 0,
        detail: `dossier — done=${done} failed=${failed} skipped=${skipped}\n${lines.join("\n")}`.trimEnd(),
      };
    },
  },
  {
    name: "story",
    describe: "Backfill editorial story pages for completed dossiers (--dossier=<id> or --symbols=MU).",
    run: async (db, symbols, opts) => {
      const res = await runStoryBackfillJob(db, {
        ...(opts?.dossierId ? { dossierId: opts.dossierId } : {}),
        ...(symbols ? { symbols } : {}),
        providerFor: liveProviderFor,
        narrate: true,
        log: (msg) => console.log(msg),
      });
      const parts = [`built=${res.built.length}`, `skipped=${res.skipped.length}`, `errors=${res.errors.length}`];
      const detailLines: string[] = [];
      if (res.built.length) detailLines.push(`  built: ${res.built.join(", ")}`);
      if (res.skipped.length) detailLines.push(`  skipped: ${res.skipped.join(", ")}`);
      if (res.errors.length) detailLines.push(`  errors: ${res.errors.join("; ")}`);
      return {
        ok: res.errors.length === 0 && res.built.length > 0,
        detail: `story — ${parts.join(" ")}${detailLines.length ? `\n${detailLines.join("\n")}` : ""}`,
      };
    },
  },
  {
    name: "backup",
    describe: "VACUUM INTO data/backups/engine-YYYY-MM-DD.db; keep the newest 14.",
    run: async (db) => ({ ok: true, detail: runBackupJob(db) }),
  },
  {
    name: "buylist_draft",
    describe: "Draft the month's buy list from fresh BUY RecCalls (governed sizes over the capital).",
    run: async (db) => ({ ok: true, detail: runBuyListJob(db) }),
  },
  {
    name: "outcomes",
    describe: "Fill RecCall outcome horizons (1m/3m/6m/1y) from local despiked closes.",
    run: async (db) => ({ ok: true, detail: runOutcomesJob(db) }),
  },
  {
    name: "campaign",
    describe: "Seed the dossier queue toward the calibration target (watchlist → AI lens → GICS leaders).",
    run: async (db) => ({ ok: true, detail: seedCampaign(db, new SqliteDossierStore(db)) }),
  },
  {
    name: "universe_check",
    describe: "Deactivate delisted/stale-data stragglers (reversible; never touches watchlisted).",
    run: async (db) => ({ ok: true, detail: runUniverseCheck(db) }),
  },
  {
    name: "integrity_check",
    describe: "Scan Price table history for unadjusted stock splits, flat runs, and chronological gaps.",
    run: async (db, symbols) => {
      const detail = await runIntegrityJob(db, symbols ?? activeSymbols(db));
      return { ok: true, detail };
    },
  },
  {
    name: "backtest",
    describe: "Run deterministic signal backtest over the historical grid.",
    run: async (db) => {
      const detail = await runBacktestJob(db);
      return { ok: true, detail };
    },
  },
  {
    name: "portfolio_check",
    describe: "Evaluate thesis-decay signals for all open positions.",
    run: async (db) => {
      const detail = await runPortfolioCheck(db);
      return { ok: true, detail };
    },
  },
  {
    name: "screens",
    describe: "Compute Piotroski, Sloan, dilution, cohort, and YoY earnings screens and upsert Candidates.",
    run: async (db, symbols) => {
      const syms = symbols ?? activeSymbols(db);

      // Gather cohort inputs for ALL active symbols to build sector-relative cohorts
      const allActive = activeSymbols(db);
      const cohortInputs: { symbol: string; sectorCode: string; evToEbit: number | null }[] = [];
      for (const symbol of allActive) {
        try {
          const gicsRow = db.prepare('SELECT "sectorCode" FROM "TickerSector" WHERE "symbol"=? AND "sectorCode" LIKE \'g_%\' LIMIT 1').get(symbol) as { sectorCode: string } | undefined;
          const sectorCode = gicsRow?.sectorCode;
          if (!sectorCode) continue;

          const quarters = mergeQuarters(db.prepare('SELECT * FROM "FundamentalsQuarter" WHERE "symbol"=? ORDER BY "periodEnd" ASC').all(symbol) as any[]);
          const tickerRow = db.prepare('SELECT "marketCap" FROM "Ticker" WHERE "symbol"=?').get(symbol) as { marketCap: number | null } | undefined;
          const marketCap = tickerRow?.marketCap ?? null;

          const evToEbit = computeEvToEbit(quarters, marketCap);
          cohortInputs.push({ symbol, sectorCode, evToEbit });
        } catch (e) {
          // Robustness: skip errors for individual symbol cohort collection
        }
      }

      const cohortResult = computeCohortCheapness(cohortInputs);
      const cheapSymbols = cohortResult.cheap;

      let done = 0;
      let errors = 0;

      for (const symbol of syms) {
        try {
          const gicsRow = db.prepare('SELECT "sectorCode" FROM "TickerSector" WHERE "symbol"=? AND "sectorCode" LIKE \'g_%\' LIMIT 1').get(symbol) as { sectorCode: string } | undefined;
          const sectorCode = gicsRow?.sectorCode;

          const quarters = mergeQuarters(db.prepare('SELECT * FROM "FundamentalsQuarter" WHERE "symbol"=? ORDER BY "periodEnd" ASC').all(symbol) as any[]);
          const tickerRow = db.prepare('SELECT "marketCap" FROM "Ticker" WHERE "symbol"=?').get(symbol) as { marketCap: number | null } | undefined;
          const marketCap = tickerRow?.marketCap ?? null;

          const applicability = sectorCode ? screenApplicability([sectorCode]) : { applicable: true };

          const fscore = computeFScore(quarters);
          const accruals = computeAccruals(quarters);
          const dilution = computeDilution(quarters);
          const earningsTrend = computeEarningsTrend(quarters);
          const evToEbit = computeEvToEbit(quarters, marketCap);
          const cheap = cheapSymbols.has(symbol);

          // Quality gates check
          let passesGates = false;
          let sectorScreen: any = null;
          let sectorTag: string | null = null;
          let passesSectorScreen = false;

          if (sectorCode === "g_financials") {
            const bankRes = computeBankQuality(quarters);
            sectorScreen = bankRes;
            passesSectorScreen = bankRes.score >= 3;
            passesGates = passesSectorScreen;
            sectorTag = "bank-quality";
          } else if (sectorCode === "g_real_estate") {
            const reitRes = computeReitQuality(quarters, marketCap);
            sectorScreen = reitRes;
            passesSectorScreen = reitRes.verdict === "cheap";
            passesGates = passesSectorScreen;
            sectorTag = "reit-quality";
          } else {
            passesGates =
              applicability.applicable &&
              fscore.score >= 7 &&
              accruals.verdict === "pass" &&
              dilution.verdict === "pass" &&
              cheap;
          }

          const tier = passesGates ? 2 : 3;

          const triggerTags: string[] = [];
          if (sectorCode === "g_financials" || sectorCode === "g_real_estate") {
            if (passesSectorScreen && sectorTag) {
              triggerTags.push(sectorTag);
            }
          } else {
            if (fscore.score >= 7) triggerTags.push("High F-Score");
            if (accruals.verdict === "pass") triggerTags.push("Low Accruals");
            if (dilution.verdict === "pass") triggerTags.push("No Dilution");
            if (cheap) triggerTags.push("Cheap Cohort");
          }

          if (earningsTrend.verdict === "improvingConfirmed") triggerTags.push("YoY Earnings Improving");
          else if (earningsTrend.verdict === "deteriorating") triggerTags.push("YoY Earnings Deteriorating");

          const qualification: any = {
            fscore: { score: fscore.score, maxComputable: fscore.maxComputable, verdict: fscore.score >= 7 ? "pass" : "fail" },
            accruals: { value: accruals.value, verdict: accruals.verdict },
            dilution: { value: dilution.value, verdict: dilution.verdict },
            earningsTrend: { zScore: earningsTrend.zScore, verdict: earningsTrend.verdict },
            cohort: { evToEbit, cheap }
          };

          if (sectorScreen) {
            qualification.sectorScreen = sectorScreen;
          }

          const computedAt = new Date().toISOString();

          db.prepare(
            'INSERT INTO "Candidate" ("symbol", "tier", "triggerTags", "qualification", "computedAt", "userState") ' +
            'VALUES (?, ?, ?, ?, ?, ?) ' +
            'ON CONFLICT("symbol") DO UPDATE SET ' +
            '"tier"=excluded.tier, "triggerTags"=excluded.triggerTags, "qualification"=excluded.qualification, "computedAt"=excluded.computedAt'
          ).run(
            symbol,
            tier,
            JSON.stringify(triggerTags),
            JSON.stringify(qualification),
            computedAt,
            "INBOX"
          );

          done++;
        } catch (e) {
          errors++;
          console.warn(`[screens job] failed to compute screens for ${symbol}:`, e);
        }
      }

      return {
        ok: errors === 0,
        detail: `screens: done=${done} errors=${errors} cheapCohort=${cheapSymbols.size}`,
      };
    }
  },
  {
    name: "form4",
    describe: "Fetch and parse Form 4 filings for the last 90 days, upsert transactions, and check for insider clusters.",
    run: async (db, symbols) => {
      const syms = symbols ?? activeSymbols(db);
      const ua = requireUserAgent();
      let done = 0;
      let errors = 0;
      let clusterCount = 0;

      for (const symbol of syms) {
        try {
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const filings = db.prepare(
            'SELECT "accessionNo", "cik", "primaryDoc", "filedAt" ' +
            'FROM "EdgarFiling" ' +
            'WHERE "symbol" = ? AND "form" = \'4\' AND "filedAt" >= ?'
          ).all(symbol, ninetyDaysAgo) as { accessionNo: string; cik: string; primaryDoc: string | null; filedAt: string }[];

          for (const f of filings) {
            if (!f.primaryDoc) continue;
            // Fetch and parse Form 4
            const txs = await fetchForm4(
              f.cik,
              f.accessionNo,
              f.primaryDoc,
              symbol,
              f.filedAt,
              httpFetch,
              ua
            );

            if (txs.length > 0) {
              const insertStmt = db.prepare(
                'INSERT OR IGNORE INTO "InsiderTx" ' +
                '("symbol", "filerName", "filerRole", "txDate", "code", "shares", "price", "value", "sharesOwnedAfter", "tenPercentOwner", "tenB51", "accessionNo", "txIndex", "filedAt") ' +
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
              );
              db.exec("BEGIN");
              try {
                for (const row of txs) {
                  insertStmt.run(
                    row.symbol,
                    row.filerName,
                    row.filerRole,
                    row.txDate,
                    row.code,
                    row.shares,
                    row.price,
                    row.value,
                    row.sharesOwnedAfter,
                    row.tenPercentOwner,
                    row.tenB51,
                    row.accessionNo,
                    row.txIndex,
                    row.filedAt
                  );
                }
                db.exec("COMMIT");
              } catch (e) {
                db.exec("ROLLBACK");
                throw e;
              }
            }
          }

          // Run insider-cluster per symbol
          const tickerRow = db.prepare('SELECT "marketCap" FROM "Ticker" WHERE "symbol"=?').get(symbol) as { marketCap: number | null } | undefined;
          const marketCap = tickerRow?.marketCap ?? null;

          const txs = db.prepare('SELECT * FROM "InsiderTx" WHERE "symbol"=?').all(symbol) as any[];
          const clusterResult = checkInsiderCluster(txs, marketCap);

          const existing = db.prepare('SELECT * FROM "Candidate" WHERE "symbol"=?').get(symbol) as any;
          let triggerTags: string[] = [];
          let qualification: any = {};
          let userState = "INBOX";
          let tier = 3;

          if (existing) {
            triggerTags = JSON.parse(existing.triggerTags);
            qualification = JSON.parse(existing.qualification);
            userState = existing.userState;
            tier = existing.tier;
          }

          const tag = "insider-cluster";
          const hasTag = triggerTags.includes(tag);

          if (clusterResult.clustered) {
            if (!hasTag) triggerTags.push(tag);
            qualification.insiderCluster = clusterResult;
            clusterCount++;
          } else {
            if (hasTag) triggerTags = triggerTags.filter((t) => t !== tag);
            delete qualification.insiderCluster;
          }

          if (existing || clusterResult.clustered) {
            db.prepare(
              'INSERT INTO "Candidate" ("symbol", "tier", "triggerTags", "qualification", "computedAt", "userState") ' +
              'VALUES (?, ?, ?, ?, ?, ?) ' +
              'ON CONFLICT("symbol") DO UPDATE SET ' +
              '"tier"=excluded.tier, "triggerTags"=excluded.triggerTags, "qualification"=excluded.qualification, "computedAt"=excluded.computedAt'
            ).run(
              symbol,
              tier,
              JSON.stringify(triggerTags),
              JSON.stringify(qualification),
              new Date().toISOString(),
              userState
            );
          }

          done++;
        } catch (e) {
          errors++;
          console.warn(`[form4 job] failed to process Form 4 for ${symbol}:`, e);
        }
      }

      return { ok: errors === 0, detail: `form4: done=${done} errors=${errors} clustered=${clusterCount}` };
    },
  },
  {
    name: "events8k",
    describe: "Fetch and classify 8-K filings for the last 30 days and upsert FilingEvent records.",
    run: async (db, symbols) => {
      const syms = symbols ?? activeSymbols(db);
      const ua = requireUserAgent();
      let done = 0;
      let errors = 0;
      let eventsCount = 0;

      for (const symbol of syms) {
        try {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const filings = db.prepare(
            'SELECT "accessionNo", "cik", "primaryDoc", "filedAt" ' +
            'FROM "EdgarFiling" ' +
            'WHERE "symbol" = ? AND "form" = \'8-K\' AND "filedAt" >= ?'
          ).all(symbol, thirtyDaysAgo) as { accessionNo: string; cik: string; primaryDoc: string | null; filedAt: string }[];

          for (const f of filings) {
            if (!f.primaryDoc) continue;
            const cleanCik = f.cik.replace(/\D/g, "").replace(/^0+/, "");
            const accessionNoNoDashes = f.accessionNo.replace(/-/g, "");
            const url = `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${accessionNoNoDashes}/${f.primaryDoc}`;

            const res = await EDGAR_LIMITER.throttle(() =>
              httpFetch(url, { headers: { "User-Agent": ua, "Accept-Encoding": "gzip" } })
            );
            if (!res.ok) {
              throw new Error(`EDGAR 8-K fetch ${f.accessionNo}: HTTP ${res.status}`);
            }
            let text = await res.text();
            if (text.length > 20000) {
              text = text.slice(0, 20000);
            }

            const events = classify8k(text);

            if (events.length > 0) {
              const insertEventStmt = db.prepare(
                'INSERT INTO "FilingEvent" ' +
                '("symbol", "accessionNo", "form", "item", "kind", "headline", "snippet", "severity", "filedAt") ' +
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
                'ON CONFLICT("accessionNo", "item") DO UPDATE SET ' +
                '"kind"=excluded.kind, "headline"=excluded.headline, "snippet"=excluded.snippet, "severity"=excluded.severity, "filedAt"=excluded.filedAt'
              );

              db.exec("BEGIN");
              try {
                for (const ev of events) {
                  insertEventStmt.run(
                    symbol,
                    f.accessionNo,
                    "8-K",
                    ev.item,
                    ev.kind,
                    ev.headline,
                    ev.snippet,
                    ev.severity,
                    f.filedAt
                  );
                  eventsCount++;
                }
                db.exec("COMMIT");
              } catch (e) {
                db.exec("ROLLBACK");
                throw e;
              }
            }

            const spinoffSignal = detectSpinoff(text, undefined, symbol);
            if (spinoffSignal) {
              db.prepare(
                'INSERT INTO "FilingEvent" ' +
                '("symbol", "accessionNo", "form", "item", "kind", "headline", "snippet", "severity", "filedAt") ' +
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
                'ON CONFLICT("accessionNo", "item") DO UPDATE SET ' +
                '"kind"=excluded.kind, "headline"=excluded.headline, "snippet"=excluded.snippet, "severity"=excluded.severity, "filedAt"=excluded.filedAt'
              ).run(
                symbol,
                f.accessionNo,
                "8-K",
                "spinoff",
                "spinoff",
                spinoffSignal.headline,
                spinoffSignal.snippet,
                "notable",
                f.filedAt
              );
              eventsCount++;

              const existing = db.prepare('SELECT * FROM "Candidate" WHERE "symbol"=?').get(symbol) as any;
              let triggerTags: string[] = [];
              let qualification: any = {};
              let userState = "INBOX";
              let tier = 3;

              if (existing) {
                try {
                  triggerTags = JSON.parse(existing.triggerTags);
                } catch {
                  triggerTags = [];
                }
                try {
                  qualification = JSON.parse(existing.qualification);
                } catch {
                  qualification = {};
                }
                userState = existing.userState;
                tier = existing.tier;
              }

              if (!triggerTags.includes("spinoff")) {
                triggerTags.push("spinoff");
              }

              db.prepare(
                'INSERT INTO "Candidate" ("symbol", "tier", "triggerTags", "qualification", "computedAt", "userState") ' +
                'VALUES (?, ?, ?, ?, ?, ?) ' +
                'ON CONFLICT("symbol") DO UPDATE SET ' +
                '"tier"=excluded.tier, "triggerTags"=excluded.triggerTags, "qualification"=excluded.qualification, "computedAt"=excluded.computedAt'
              ).run(
                symbol,
                tier,
                JSON.stringify(triggerTags),
                JSON.stringify(qualification),
                new Date().toISOString(),
                userState
              );
            }
          }

          done++;
        } catch (e) {
          errors++;
          console.warn(`[events8k job] failed to process 8-K for ${symbol}:`, e);
        }
      }

      return { ok: errors === 0, detail: `events8k: done=${done} errors=${errors} events=${eventsCount}` };
    },
  },
  {
    name: "holdings_13f",
    describe: "Ingest latest 13F filings for curated superinvestors, compute overlaps, and tag candidates.",
    run: async (db) => {
      const ua = requireUserAgent();
      let done = 0;
      let errors = 0;

      for (const s of SUPERINVESTORS) {
        try {
          const result = await fetch13FLatest(s.cik, httpFetch, ua);
          if (!result) {
            console.warn(`[holdings_13f] No 13F found for ${s.name} (${s.cik})`);
            continue;
          }

          const { holdings, periodOfReport, filedAt } = result;

          const insertStmt = db.prepare(
            'INSERT OR IGNORE INTO "InstitutionalHolding" ' +
            '("filerCik", "filerName", "periodOfReport", "cusip", "nameOfIssuer", "value", "shares", "filedAt") ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          );

          db.exec("BEGIN");
          try {
            for (const h of holdings) {
              insertStmt.run(
                s.cik,
                s.name,
                periodOfReport,
                h.cusip,
                h.nameOfIssuer,
                h.value,
                h.sshPrnamt,
                filedAt
              );
            }
            db.exec("COMMIT");
          } catch (dbErr) {
            db.exec("ROLLBACK");
            throw dbErr;
          }

          done++;
        } catch (e) {
          errors++;
          console.warn(`[holdings_13f] Failed to process 13F for superinvestor ${s.name} (${s.cik}):`, e);
        }
      }

      // Now run the overlap screen across all stored holdings
      try {
        const allStored = db.prepare('SELECT * FROM "InstitutionalHolding"').all() as any[];
        const activeTickers = db.prepare('SELECT "symbol", "name" FROM "Ticker" WHERE "active" = 1').all() as { symbol: string; name: string | null }[];

        // Map CUSIP -> symbol using fuzzy name matching
        const cusipToSymbol = new Map<string, string>();
        const uniqueCusips = new Map<string, string>(); // CUSIP -> nameOfIssuer
        for (const h of allStored) {
          uniqueCusips.set(h.cusip, h.nameOfIssuer);
        }

        for (const [cusip, nameOfIssuer] of uniqueCusips) {
          const matched = activeTickers.find((t) => t.name && matchesFuzzy(nameOfIssuer, t.name));
          if (matched) {
            cusipToSymbol.set(cusip, matched.symbol);
          }
        }

        const overlapResults = computeSuperinvestorOverlap(allStored, cusipToSymbol);
        const overlapSymbols = new Set(overlapResults.map((r) => r.symbol));

        // Merge tags into Candidates
        for (const res of overlapResults) {
          try {
            const existing = db.prepare('SELECT * FROM "Candidate" WHERE "symbol"=?').get(res.symbol) as any;
            if (existing) {
              let triggerTags: string[] = [];
              try {
                triggerTags = JSON.parse(existing.triggerTags);
              } catch {
                triggerTags = [];
              }

              let qualification: any = {};
              try {
                qualification = JSON.parse(existing.qualification);
              } catch {
                qualification = {};
              }

              const tag = "superinvestor";
              if (!triggerTags.includes(tag)) {
                triggerTags.push(tag);
              }

              qualification.superinvestor = {
                holders: res.holders,
                count: res.holderCount,
                newThisQuarter: res.newThisQuarter,
              };

              db.prepare(
                'UPDATE "Candidate" SET "triggerTags" = ?, "qualification" = ?, "computedAt" = ? WHERE "symbol" = ?'
              ).run(
                JSON.stringify(triggerTags),
                JSON.stringify(qualification),
                new Date().toISOString(),
                res.symbol
              );
            }
          } catch (candErr) {
            console.warn(`[holdings_13f] Failed to update candidate for ${res.symbol}:`, candErr);
          }
        }

        // Clean up candidates that no longer have superinvestor holdings
        const allCandidates = db.prepare('SELECT * FROM "Candidate"').all() as any[];
        for (const cand of allCandidates) {
          try {
            let triggerTags: string[] = [];
            try {
              triggerTags = JSON.parse(cand.triggerTags);
            } catch {
              continue;
            }

            const hasTag = triggerTags.includes("superinvestor");
            if (hasTag && !overlapSymbols.has(cand.symbol)) {
              triggerTags = triggerTags.filter((t) => t !== "superinvestor");
              let qualification: any = {};
              try {
                qualification = JSON.parse(cand.qualification);
              } catch {
                qualification = {};
              }
              delete qualification.superinvestor;

              db.prepare(
                'UPDATE "Candidate" SET "triggerTags" = ?, "qualification" = ?, "computedAt" = ? WHERE "symbol" = ?'
              ).run(
                JSON.stringify(triggerTags),
                JSON.stringify(qualification),
                new Date().toISOString(),
                cand.symbol
              );
            }
          } catch (candErr) {
            console.warn(`[holdings_13f] Failed to clean candidate for ${cand.symbol}:`, candErr);
          }
        }

      } catch (overlapErr) {
        errors++;
        console.warn(`[holdings_13f] Failed to compute overlap screen:`, overlapErr);
      }

      return {
        ok: errors === 0,
        detail: `holdings_13f: superinvestors_done=${done} errors=${errors}`,
      };
    },
  },
  {
    name: "research_run",
    describe: "Execute a research run under budget constraints.",
    run: async (db, symbols, opts) => {
      if (!opts?.runId) {
        return { ok: false, detail: "Missing runId parameter." };
      }
      reconcileRuns(db);
      db.prepare('UPDATE "ResearchRun" SET "pid" = ? WHERE "id" = ?').run(process.pid, opts.runId);
      const runner = new OnDemandResearchRunner(db, opts.runId, liveProviderFor);
      await runner.execute();
      return { ok: true, detail: `Research run ${opts.runId} completed.` };
    },
  },
  {
    name: "research_create",
    describe: "Create a new research run row.",
    run: async (db, symbols, opts) => {
      if (!opts?.runType || !opts?.runTarget || opts?.budgetMin === undefined) {
        return { ok: false, detail: "Missing --type, --target, or --budget-min." };
      }
      const budgetSeconds = opts.budgetMin * 60;
      const config = getBudgetConfig(opts.runType, budgetSeconds);
      const runId = createResearchRun(db, {
        runType: opts.runType,
        target: opts.runTarget,
        budgetSeconds,
        profile: config.modelProfile,
      });
      return { ok: true, detail: `Created research run: ${runId}` };
    },
  },
];

/** Runnable job entries with `db` bound in. Shared by the CLI and the scheduler. */
export function buildLiveRegistry(db: SqlDb): JobEntry[] {
  return JOB_DEFS.map((d) => ({
    name: d.name,
    describe: d.describe,
    run: (symbols?: string[], opts?: JobRunOpts) => d.run(db, symbols, opts),
  }));
}

/** Name+describe metadata for `--list` — needs no DB and no network. */
export function jobCatalog(): { name: string; describe: string }[] {
  return JOB_DEFS.map((d) => ({ name: d.name, describe: d.describe }));
}

// ── scheduler idle drain ─────────────────────────────────────────────────────

/**
 * The scheduler's idle-tick dossier drain: first requeue any dossier stuck
 * "running" past the stale threshold (recoverStale), then drain the queue with the
 * LIVE providers/fetchers, one dossier at a time. runDossierJob serializes the
 * queue internally and the analyst harness holds a per-endpoint single-flight lock,
 * so this respects the llama lock and never double-fires an LLM. Never throws.
 */
export async function drainDossierQueueLive(db: SqlDb, log: (msg: string) => void = () => {}): Promise<void> {
  const store = new SqliteDossierStore(db);
  const recovered = recoverStale(store);
  if (recovered > 0) log(`[scheduler] recovered ${recovered} stale dossier(s) → requeued`);
  // Keep the queue stocked so the ledger grows toward calibration significance;
  // seedCampaign self-limits to the backlog target so it never outruns the daemon.
  const seed = seedCampaign(db, store);
  if (!seed.includes("nothing added") && !seed.includes("backlog full")) log(`[scheduler] ${seed}`);
  const { ran } = await runDossierJob(db, undefined, {
    providerFor: liveProviderFor,
    live: liveFetchers(),
    log,
  });
  if (ran.length > 0) log(`[scheduler] dossier drain: ran ${ran.length}`);
}
