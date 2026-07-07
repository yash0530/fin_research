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
import type { LiveFetchers } from "../tools/factory";

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
export type JobRunOpts = { dossierId?: string; force?: boolean };
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
