// Generic resumable backfill orchestrator. The live Yahoo/EDGAR fetchers plug
// into `fetchOne`; this module owns the hard parts that must be correct:
// resumability (skip already-done symbols) and catch-per-item (one symbol's
// failure is recorded, never fatal). Pure control flow → fully testable with fakes.
//
// The bottom of this file wires the three real backfill TASKS (prices10y,
// fundamentals, edgar_index) onto the orchestrator + the DB persistence helpers.
// The network fetchers are still injected (built in scripts/job.ts), so the tasks
// stay testable with mocked fetchers and never touch the wire in vitest.

import type { SqlDb } from "../db/migrate";
import {
  insertPrices,
  insertFundamentals,
  insertEdgarFilings,
  setTickerCik,
  backfillIsDone,
  markBackfill,
  type FundamentalsQuarterRow,
  type EdgarFilingInsert,
} from "../db/queries";
import type { DailyBar } from "../net/yahoo2";

export type BackfillDeps<T> = {
  symbols: string[];
  /** True if this symbol was completed on a prior run (BackfillProgress = done). */
  isDone: (symbol: string) => boolean;
  /** Fetch this symbol's rows. May throw / reject — the orchestrator catches. */
  fetchOne: (symbol: string) => Promise<T[]>;
  /** Persist rows (chunked INSERT OR IGNORE in the real impl). */
  write: (symbol: string, rows: T[]) => void | Promise<void>;
  markDone: (symbol: string, rows: number) => void;
  markError: (symbol: string, err: string) => void;
  /** Optional per-item pause (rate-limit friendliness). */
  onEach?: () => Promise<void>;
};

export type BackfillSummary = {
  done: number;
  errors: number;
  skipped: number;
  rows: number;
};

export async function runBackfill<T>(deps: BackfillDeps<T>): Promise<BackfillSummary> {
  let done = 0;
  let errors = 0;
  let skipped = 0;
  let rows = 0;

  for (const symbol of deps.symbols) {
    if (deps.isDone(symbol)) {
      skipped += 1;
      continue; // resumable: never redo completed work
    }
    try {
      const fetched = await deps.fetchOne(symbol);
      await deps.write(symbol, fetched);
      deps.markDone(symbol, fetched.length);
      rows += fetched.length;
      done += 1;
    } catch (e) {
      // catch-per-item: record and keep going
      deps.markError(symbol, e instanceof Error ? e.message : String(e));
      errors += 1;
    }
    if (deps.onEach) await deps.onEach();
  }

  return { done, errors, skipped, rows };
}

// ── Bounded-concurrency variant ──────────────────────────────────────────────
//
// Same invariants as runBackfill (resumable + catch-per-item) but with N workers
// draining a shared queue, and an optional per-item stagger for rate politeness.
// JS is single-threaded so the shared counters and `queue.shift()` are safe.

export type PooledBackfillDeps<T> = BackfillDeps<T> & {
  concurrency?: number;
  staggerMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const _sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function runBackfillPool<T>(deps: PooledBackfillDeps<T>): Promise<BackfillSummary> {
  const conc = Math.max(1, Math.floor(deps.concurrency ?? 1));
  const stagger = deps.staggerMs ?? 0;
  const sleep = deps.sleep ?? _sleep;
  const queue = [...deps.symbols];
  let done = 0;
  let errors = 0;
  let skipped = 0;
  let rows = 0;

  async function worker(startDelayMs: number): Promise<void> {
    if (startDelayMs > 0) await sleep(startDelayMs);
    for (;;) {
      const symbol = queue.shift();
      if (symbol === undefined) return;
      if (deps.isDone(symbol)) {
        skipped += 1;
        continue;
      }
      try {
        const fetched = await deps.fetchOne(symbol);
        await deps.write(symbol, fetched);
        deps.markDone(symbol, fetched.length);
        rows += fetched.length;
        done += 1;
      } catch (e) {
        deps.markError(symbol, e instanceof Error ? e.message : String(e));
        errors += 1;
      }
      if (stagger > 0) await sleep(stagger);
    }
  }

  // Stagger worker starts so N parallel workers don't all hit the wire at t=0.
  await Promise.all(Array.from({ length: conc }, (_, i) => worker(i * stagger)));
  return { done, errors, skipped, rows };
}

// ── Live-wired backfill tasks ────────────────────────────────────────────────

export const PRICES_TASK = "prices10y";
export const FUNDAMENTALS_TASK = "fundamentals";
export const EDGAR_TASK = "edgar_index";

const DAY_MS = 86_400_000;

function chunkRows<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type PricesBackfillOpts = {
  symbols: string[];
  /** Fetch daily bars for a symbol since `period1`. May throw / return []. */
  fetchBars: (symbol: string, period1: Date) => Promise<DailyBar[]>;
  lookbackDays?: number; // default 3660 (~10y + buffer)
  concurrency?: number; // default 2
  staggerMs?: number; // default 1200
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * prices10y: bars since today−3660d per symbol → Price via chunked 500-row
 * INSERT OR IGNORE txns, BackfillProgress per symbol. Resumable + catch-per-item.
 */
export async function backfillPrices10y(db: SqlDb, opts: PricesBackfillOpts): Promise<BackfillSummary> {
  const now = opts.now ? opts.now() : Date.now();
  const period1 = new Date(now - (opts.lookbackDays ?? 3660) * DAY_MS);
  return runBackfillPool<DailyBar>({
    symbols: opts.symbols,
    concurrency: opts.concurrency ?? 2,
    staggerMs: opts.staggerMs ?? 1200,
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
    isDone: (s) => backfillIsDone(db, PRICES_TASK, s),
    fetchOne: (s) => opts.fetchBars(s, period1),
    write: (_s, rows) => {
      for (const part of chunkRows(rows, 500)) insertPrices(db, part);
    },
    markDone: (s, rows) => markBackfill(db, PRICES_TASK, s, "done", rows),
    markError: (s) => markBackfill(db, PRICES_TASK, s, "error"),
  });
}

export type FundamentalsBackfillOpts = {
  symbols: string[];
  fetchFundamentals: (symbol: string) => Promise<FundamentalsQuarterRow[]>;
  concurrency?: number; // default 2
  staggerMs?: number; // default 1200
  sleep?: (ms: number) => Promise<void>;
};

export const EDGAR_FACTS_TASK = "edgar_facts";

export type EdgarFactsBackfillOpts = {
  ciks: { symbol: string; cik: string }[];
  fetchFacts: (cik: string, symbol: string) => Promise<FundamentalsQuarterRow[]>;
  concurrency?: number; // default 2 (shares the 8 req/s EDGAR bucket)
  staggerMs?: number; // default 400
  sleep?: (ms: number) => Promise<void>;
};

/** edgar_facts: deep quarterly fundamentals from EDGAR XBRL companyfacts (years of
 *  history) → FundamentalsQuarter. INSERT OR IGNORE means a Yahoo-seeded quarter is
 *  never clobbered; EDGAR only ADDS the deeper back-history. */
export async function backfillEdgarFacts(db: SqlDb, opts: EdgarFactsBackfillOpts): Promise<BackfillSummary> {
  const cikBySymbol = new Map(opts.ciks.map((c) => [c.symbol.toUpperCase(), c.cik]));
  return runBackfillPool<FundamentalsQuarterRow>({
    symbols: opts.ciks.map((c) => c.symbol.toUpperCase()),
    concurrency: opts.concurrency ?? 2,
    staggerMs: opts.staggerMs ?? 400,
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
    isDone: (s) => backfillIsDone(db, EDGAR_FACTS_TASK, s),
    fetchOne: (s) => opts.fetchFacts(cikBySymbol.get(s) as string, s),
    write: (_s, rows) => {
      insertFundamentals(db, rows, 500);
    },
    markDone: (s, rows) => markBackfill(db, EDGAR_FACTS_TASK, s, "done", rows),
    markError: (s) => markBackfill(db, EDGAR_FACTS_TASK, s, "error"),
  });
}

/** fundamentals: quarterly fundamentals per symbol → FundamentalsQuarter. */
export async function backfillFundamentals(db: SqlDb, opts: FundamentalsBackfillOpts): Promise<BackfillSummary> {
  return runBackfillPool<FundamentalsQuarterRow>({
    symbols: opts.symbols,
    concurrency: opts.concurrency ?? 2,
    staggerMs: opts.staggerMs ?? 1200,
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
    isDone: (s) => backfillIsDone(db, FUNDAMENTALS_TASK, s),
    fetchOne: (s) => opts.fetchFundamentals(s),
    write: (_s, rows) => {
      insertFundamentals(db, rows, 500);
    },
    markDone: (s, rows) => markBackfill(db, FUNDAMENTALS_TASK, s, "done", rows),
    markError: (s) => markBackfill(db, FUNDAMENTALS_TASK, s, "error"),
  });
}

/**
 * Parse SEC's company_tickers.json (`{ "0": { cik_str, ticker, title }, … }`) into
 * a SYMBOL→10-digit-CIK map. Pure → tested with a fixture, no network.
 */
export function parseCompanyTickers(json: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const rows = json && typeof json === "object" ? Object.values(json as Record<string, unknown>) : [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { cik_str?: unknown; ticker?: unknown };
    const ticker = typeof r.ticker === "string" ? r.ticker.trim().toUpperCase() : "";
    const cikNum = typeof r.cik_str === "number" ? r.cik_str : Number(r.cik_str);
    if (!ticker || !Number.isFinite(cikNum)) continue;
    out[ticker] = String(cikNum).padStart(10, "0");
  }
  return out;
}

export type EdgarBackfillOpts = {
  symbols: string[];
  /** SYMBOL→CIK map (from parseCompanyTickers). Symbols absent here are skipped. */
  cikMap: Record<string, string>;
  /** Fetch parsed filing rows for a (cik, symbol). Uses the shared EDGAR limiter. */
  fetchFilings: (cik: string, symbol: string) => Promise<EdgarFilingInsert[]>;
  concurrency?: number; // default 1 (EDGAR is politeness-bound by its limiter)
  staggerMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * edgar_index: map CIKs onto Ticker.cik, then pull submissions per symbol →
 * EdgarFiling rows (10-K/10-Q/8-K/4/DEF 14A, filtered by parseSubmissions).
 */
export async function backfillEdgarIndex(db: SqlDb, opts: EdgarBackfillOpts): Promise<BackfillSummary> {
  // 1) persist CIKs once (so a symbol without a CIK is a clean skip, not an error).
  const withCik: string[] = [];
  for (const raw of opts.symbols) {
    const symbol = raw.toUpperCase();
    const cik = opts.cikMap[symbol];
    if (!cik) continue;
    setTickerCik(db, symbol, cik);
    withCik.push(symbol);
  }
  // 2) submissions per symbol.
  return runBackfillPool<EdgarFilingInsert>({
    symbols: withCik,
    concurrency: opts.concurrency ?? 1,
    staggerMs: opts.staggerMs ?? 0,
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
    isDone: (s) => backfillIsDone(db, EDGAR_TASK, s),
    fetchOne: (s) => opts.fetchFilings(opts.cikMap[s], s),
    write: (_s, rows) => {
      insertEdgarFilings(db, rows, 500);
    },
    markDone: (s, rows) => markBackfill(db, EDGAR_TASK, s, "done", rows),
    markError: (s) => markBackfill(db, EDGAR_TASK, s, "error"),
  });
}
