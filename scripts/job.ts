#!/usr/bin/env tsx
// Job CLI — run any registered job against DATABASE_URL:
//   npm run job -- <name> [--symbols=A,B,C]
//   npm run job -- prices10y            # resumable 10y price backfill
//   npm run job -- overnight            # the full morning chain
//   npm run job -- --list               # list jobs (no DB, no network)
//
// The registry is assembled here so `--list` never touches the wire; the live
// fetchers (yahoo2 / Stooq / EDGAR) are built lazily inside each job's `run`.

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SqlDb } from "../src/db/migrate";
import {
  activeSymbols,
  watchlistSymbols,
} from "../src/db/queries";
import {
  backfillPrices10y,
  backfillFundamentals,
  backfillEdgarIndex,
  parseCompanyTickers,
  type BackfillSummary,
} from "../src/jobs/backfill";
import { runStatsJob } from "../src/jobs/stats";
import { runNewsJob, type NewsQuery } from "../src/jobs/news";
import { runEarningsJob } from "../src/jobs/earnings";
import { runOvernight, runPricesHealJob, runDigestJob } from "../src/jobs/overnight";
import { runRulesJob } from "../src/rules/engine";
import { TRIPWIRES } from "../src/config/tripwires";
import { AI_INFRA_SEEDS, AI_INFRA_SYMBOLS } from "../src/config/sectors";
import {
  fetchDailyBars,
  fetchQuoteBatch,
  fetchQuarterlyFundamentals,
  fetchEarningsDates,
  type DailyBar,
} from "../src/net/yahoo2";
import { routeDailyBars, fetchStooqDaily, type HttpResponse } from "../src/net/route";
import { fetchSubmissions, type Fetcher } from "../src/net/fetchers";
import { requireUserAgent, EDGAR_LIMITER, type EdgarFilingRow } from "../src/net/edgar";

// ── env + DB open (mirrors scripts/seed.ts) ──────────────────────────────────

/** Load simple KEY="value" pairs from .env into process.env (non-overriding).
 *  Jobs need more than DATABASE_URL (e.g. EDGAR_USER_AGENT for edgar_index). */
function loadDotEnv(): void {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    process.env[key] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

function databaseFile(): string {
  const url = process.env.DATABASE_URL;
  return (url ?? "file:./data/engine.db").replace(/^file:/, "");
}

function openDb(): SqlDb {
  const file = databaseFile();
  mkdirSync(dirname(file) || ".", { recursive: true });
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

// ── registry ──────────────────────────────────────────────────────────────────

type JobCtx = { db: SqlDb; symbols?: string[] };
type JobOutcome = { ok: boolean; detail: string };
type JobEntry = { name: string; describe: string; run: (ctx: JobCtx) => Promise<JobOutcome> };

const backfillOutcome = (label: string, s: BackfillSummary): JobOutcome => ({
  ok: s.errors === 0,
  detail: `${label}: done=${s.done} errors=${s.errors} skipped=${s.skipped} rows=${s.rows}`,
});

const REGISTRY: JobEntry[] = [
  {
    name: "prices10y",
    describe: "Resumable ~10y daily-price backfill (yahoo2 → Stooq) into Price.",
    run: async ({ db, symbols }) =>
      backfillOutcome("prices10y", await backfillPrices10y(db, { symbols: symbols ?? activeSymbols(db), fetchBars: routedBars })),
  },
  {
    name: "fundamentals",
    describe: "Resumable quarterly-fundamentals backfill (yahoo2) into FundamentalsQuarter.",
    run: async ({ db, symbols }) =>
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
    run: async ({ db, symbols }) => {
      const cikMap = await fetchCikMap();
      return backfillOutcome(
        "edgar_index",
        await backfillEdgarIndex(db, { symbols: symbols ?? activeSymbols(db), cikMap, fetchFilings: edgarFilings }),
      );
    },
  },
  {
    name: "stats",
    describe: "Refresh Ticker stat columns from batched yahoo2 quote() (≤100/req).",
    run: async ({ db, symbols }) => {
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
    run: async ({ db }) => {
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
    run: async ({ db, symbols }) => {
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
    run: async ({ db }) => ({ ok: true, detail: await runRulesJob(db, TRIPWIRES) }),
  },
  {
    name: "digest",
    describe: "Synthesize the deterministic morning digest from stored facts → Digest.",
    run: async ({ db }) => ({ ok: true, detail: await runDigestJob(db) }),
  },
  {
    name: "overnight",
    describe: "The full chain: prices-heal → stats → news → earnings → rules → digest.",
    run: async ({ db, symbols }) => {
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
        rules: () => runRulesJob(db, TRIPWIRES),
        digest: () => runDigestJob(db),
      });
      const lines = summary.results.map((r) => `  ${r.ok ? "✓" : "✗"} ${r.job}: ${r.detail}`).join("\n");
      return { ok: summary.failed === 0, detail: `overnight — ok=${summary.ok} failed=${summary.failed}\n${lines}` };
    },
  },
];

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { name?: string; list: boolean; symbols?: string[] } {
  let name: string | undefined;
  let list = false;
  let symbols: string[] | undefined;
  for (const arg of argv) {
    if (arg === "--list") list = true;
    else if (arg.startsWith("--symbols=")) {
      symbols = arg
        .slice("--symbols=".length)
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg.startsWith("--task=")) {
      name = arg.slice("--task=".length).trim();
    } else if (!arg.startsWith("--") && !name) {
      name = arg;
    }
  }
  return { list, ...(name ? { name } : {}), ...(symbols ? { symbols } : {}) };
}

function printList(): void {
  console.log("Registered jobs:");
  for (const j of REGISTRY) console.log(`  ${j.name.padEnd(14)} ${j.describe}`);
}

async function main(): Promise<void> {
  const { name, list, symbols } = parseArgs(process.argv.slice(2));

  if (list || !name) {
    printList();
    if (!name && !list) {
      console.error("\nNo job specified. Usage: npm run job -- <name> [--symbols=A,B]");
      process.exit(2);
    }
    return;
  }

  const entry = REGISTRY.find((j) => j.name === name);
  if (!entry) {
    console.error(`Unknown job "${name}".`);
    printList();
    process.exit(2);
    return;
  }

  const db = openDb();
  const started = Date.now();
  try {
    const outcome = await entry.run({ db, ...(symbols ? { symbols } : {}) });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[${outcome.ok ? "OK" : "FAIL"}] ${entry.name} (${secs}s)\n${outcome.detail}`);
    process.exit(outcome.ok ? 0 : 1);
  } catch (e) {
    console.error(`[ERROR] ${entry.name}: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  } finally {
    (db as unknown as { close?: () => void }).close?.();
  }
}

void main();
