// Provider-chain routing for DAILY BARS: yahoo2 first, then a gentle Stooq CSV
// fallback when yahoo2 returns nothing (delisted/blocked/empty). Stats and
// fundamentals are yahoo2-only (Stooq has no fundamentals feed) — the jobs call
// the yahoo2 adapter directly for those. Every row that leaves here carries its
// `source` so provenance is never lost downstream.
//
// The Stooq CSV parser is pure and fixture-tested; the fetch wrapper (and the
// route itself) inject their fetchers/sleep so tests stay network-free.

import { YAHOO2_SOURCE, type DailyBar, type FetchResult } from "./yahoo2";

export const STOOQ_SOURCE = "stooq";
export const STOOQ_STAGGER_MS = 2000; // ≥2s between Stooq hits (etiquette)

export type HttpResponse = { ok: boolean; status: number; text: () => Promise<string> };
export type Fetcher = (url: string) => Promise<HttpResponse>;

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Stooq daily-history endpoint for a US ticker. */
export function stooqUrl(symbol: string): string {
  return `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}.us&i=d`;
}

/**
 * Parse Stooq's daily CSV (`Date,Open,High,Low,Close,Volume`) into our bars.
 * Rows without a finite close (or Stooq's "N/D" placeholder) are skipped.
 */
export function parseStooqCsv(symbol: string, csv: string): DailyBar[] {
  const sym = symbol.toUpperCase();
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const dIdx = header.indexOf("date");
  const cIdx = header.indexOf("close");
  const vIdx = header.indexOf("volume");
  if (dIdx < 0 || cIdx < 0) return [];
  const out: DailyBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const d = (cols[dIdx] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const close = Number(cols[cIdx]);
    if (!Number.isFinite(close)) continue;
    const volRaw = vIdx >= 0 ? Number(cols[vIdx]) : NaN;
    out.push({ symbol: sym, d, close, volume: Number.isFinite(volRaw) ? volRaw : null, source: STOOQ_SOURCE });
  }
  return out;
}

/** Fetch + parse Stooq daily history. Never throws (returns [] + error string). */
export async function fetchStooqDaily(
  symbol: string,
  fetchImpl: Fetcher,
): Promise<FetchResult<DailyBar>> {
  try {
    const res = await fetchImpl(stooqUrl(symbol));
    if (!res.ok) return { rows: [], error: `stooq ${symbol}: HTTP ${res.status}` };
    const csv = await res.text();
    return { rows: parseStooqCsv(symbol, csv), error: null };
  } catch (e) {
    return { rows: [], error: `stooq ${symbol}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export type BarsFetcher = (symbol: string, period1: Date) => Promise<FetchResult<DailyBar>>;
export type StooqBarsFetcher = (symbol: string) => Promise<FetchResult<DailyBar>>;

export type RouteDeps = {
  /** Primary daily-bar fetcher (default in the app: net/yahoo2.fetchDailyBars). */
  yahoo2: BarsFetcher;
  /** Fallback fetcher (default in the app: fetchStooqDaily bound to global fetch). */
  stooq?: StooqBarsFetcher;
  staggerMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type RoutedBars = { symbol: string; rows: DailyBar[]; source: string | null; error: string | null };

/**
 * Daily bars via the provider chain. yahoo2 wins when it returns any rows; on an
 * empty/failed yahoo2 result we wait `staggerMs` (Stooq etiquette) then fall back.
 * Stooq rows are filtered to `d >= period1` so the fallback respects the window.
 */
export async function routeDailyBars(symbol: string, period1: Date, deps: RouteDeps): Promise<RoutedBars> {
  const sym = symbol.toUpperCase();
  const primary = await deps.yahoo2(sym, period1);
  if (primary.rows.length > 0) {
    return { symbol: sym, rows: primary.rows, source: YAHOO2_SOURCE, error: null };
  }
  if (!deps.stooq) {
    return { symbol: sym, rows: [], source: null, error: primary.error ?? `${sym}: no yahoo2 rows` };
  }
  const sleep = deps.sleep ?? defaultSleep;
  const stagger = deps.staggerMs ?? STOOQ_STAGGER_MS;
  if (stagger > 0) await sleep(stagger);
  const fb = await deps.stooq(sym);
  const floor = period1.toISOString().slice(0, 10);
  const rows = fb.rows.filter((r) => r.d >= floor);
  if (rows.length > 0) {
    return { symbol: sym, rows, source: STOOQ_SOURCE, error: null };
  }
  const errors = [primary.error, fb.error].filter(Boolean).join("; ");
  return { symbol: sym, rows: [], source: null, error: errors || `${sym}: no bars from any provider` };
}
