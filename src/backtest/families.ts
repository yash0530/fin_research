import type { SqlDb } from "../db/migrate";
import { despike, pctChange } from "../lib/metrics";
import { activeSymbols, symbolClosesUpTo, closesBetween } from "../db/queries";

const BENCHMARK_SYMBOLS = new Set(["HYG", "IEF"]);

export function latestTradingDayUpTo(db: SqlDb, asOf: string): string | null {
  const row = db
    .prepare('SELECT MAX("d") AS d FROM "Price" WHERE "d"<=?')
    .get(asOf) as { d: string | null } | undefined;
  return row?.d ?? null;
}

/** Add calendar days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
function addDaysStr(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export type MoversResult = {
  up: string[];
  down: string[];
};

/**
 * moversAsOf(db, asOf, n=10): top |1-day %| movers as of asOf (price >= $5 filter).
 * Split into up-movers and down-movers.
 */
export function moversAsOf(db: SqlDb, asOf: string, n = 10): MoversResult {
  const latestD = latestTradingDayUpTo(db, asOf);
  if (!latestD) return { up: [], down: [] };

  const sinceD = addDaysStr(latestD, -120);
  const rows = closesBetween(db, sinceD, latestD);

  const rawBySymbol = new Map<string, { d: string; close: number }[]>();
  for (const r of rows) {
    if (BENCHMARK_SYMBOLS.has(r.symbol)) continue;
    let arr = rawBySymbol.get(r.symbol);
    if (!arr) {
      arr = [];
      rawBySymbol.set(r.symbol, arr);
    }
    arr.push({ d: r.d, close: r.close });
  }

  const activeSet = new Set(activeSymbols(db));
  const candidates: { symbol: string; retPct: number }[] = [];

  for (const [sym, arr] of rawBySymbol) {
    if (!activeSet.has(sym)) continue;
    // Freshness check: must have traded on latestD
    const lastBar = arr[arr.length - 1];
    if (lastBar.d !== latestD) continue;
    if (lastBar.close < 5) continue; // price >= 5

    // Despike
    const cleaned = despike(arr.map(x => x.close));
    if (cleaned.length < 2) continue;

    const prevClose = cleaned[cleaned.length - 2];
    const lastClose = cleaned[cleaned.length - 1];
    const ret = pctChange(prevClose, lastClose);
    if (ret !== null) {
      candidates.push({ symbol: sym, retPct: ret });
    }
  }

  // Sort by absolute return descending
  candidates.sort((a, b) => Math.abs(b.retPct) - Math.abs(a.retPct));
  const topN = candidates.slice(0, n);

  return {
    up: topN.filter(c => c.retPct > 0).map(c => c.symbol),
    down: topN.filter(c => c.retPct < 0).map(c => c.symbol),
  };
}

/**
 * drawdownFlagsAsOf(db, asOf, pct=25, lookback=252): symbols >= pct off their trailing-252-bar high.
 */
export function drawdownFlagsAsOf(
  db: SqlDb,
  asOf: string,
  pct = 25,
  lookback = 252
): string[] {
  const latestD = latestTradingDayUpTo(db, asOf);
  if (!latestD) return [];

  const active = activeSymbols(db).filter(sym => !BENCHMARK_SYMBOLS.has(sym));
  const flagged: string[] = [];

  for (const symbol of active) {
    const closes = symbolClosesUpTo(db, symbol, latestD, lookback);
    if (closes.length === 0) continue;

    // Freshness check: must have traded on latestD
    const lastBar = closes[closes.length - 1];
    if (lastBar.d !== latestD) continue;
    if (lastBar.close < 5) continue; // price >= 5

    const cleaned = despike(closes.map(c => c.close));
    if (cleaned.length === 0) continue;

    const latest = cleaned[cleaned.length - 1];
    const high = Math.max(...cleaned);
    if (high <= 0) continue;

    const dd = ((high - latest) / high) * 100;
    if (dd >= pct) {
      flagged.push(symbol);
    }
  }

  return flagged;
}

/**
 * breadthAsOf(db, asOf): % of eligible symbols above their 50-bar MA as of asOf.
 */
export function breadthAsOf(db: SqlDb, asOf: string): number {
  const latestD = latestTradingDayUpTo(db, asOf);
  if (!latestD) return 0;

  const active = activeSymbols(db).filter(sym => !BENCHMARK_SYMBOLS.has(sym));
  let above = 0;
  let totalWithMA = 0;

  for (const symbol of active) {
    const closes = symbolClosesUpTo(db, symbol, latestD, 100);
    if (closes.length < 50) continue;

    // Freshness check
    const lastBar = closes[closes.length - 1];
    if (lastBar.d !== latestD) continue;
    if (lastBar.close < 5) continue; // eligible price >= 5

    const cleaned = despike(closes.map(c => c.close));
    if (cleaned.length < 50) continue;

    const latest = cleaned[cleaned.length - 1];
    const last50 = cleaned.slice(-50);
    const sum = last50.reduce((a, b) => a + b, 0);
    const ma = sum / 50;

    totalWithMA++;
    if (latest > ma) {
      above++;
    }
  }

  if (totalWithMA === 0) return 0;
  return (above / totalWithMA) * 100;
}
