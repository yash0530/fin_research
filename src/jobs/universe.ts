// universe_check: deactivate delisted/dead-data stragglers so they stop erroring in
// the daily jobs. SAFE by construction — deactivation is reversible (active=0, never
// delete), watchlisted symbols are never touched, and a symbol is only deactivated
// when its most recent price bar is materially stale (a delisted stock stops getting
// new bars). Human-gated in spirit: re-activation is a one-liner if a symbol returns.

import type { SqlDb } from "../db/migrate";
import { maxPriceDate, latestBarDates, setTickerActive, isWatchlisted, activeSymbols } from "../db/queries";

const DAY_MS = 86_400_000;

/** Pure: symbols whose latest bar lags `maxDate` by more than `staleDays` calendar
 *  days. Symbols with NO bar at all are included (never got data). */
export function staleSymbols(
  activeSyms: string[],
  latest: { symbol: string; d: string }[],
  maxDate: string,
  staleDays: number,
): string[] {
  const latestBy = new Map(latest.map((r) => [r.symbol, r.d]));
  const maxMs = Date.parse(maxDate);
  const out: string[] = [];
  for (const s of activeSyms) {
    const d = latestBy.get(s);
    if (!d) {
      out.push(s); // active but never has a bar
      continue;
    }
    if ((maxMs - Date.parse(d)) / DAY_MS > staleDays) out.push(s);
  }
  return out;
}

export type UniverseCheckOpts = { staleDays?: number };

export function runUniverseCheck(db: SqlDb, opts: UniverseCheckOpts = {}): string {
  const staleDays = opts.staleDays ?? 14; // ~10 trading days
  const maxDate = maxPriceDate(db);
  if (!maxDate) return "universe_check: no price data yet — skipped";

  const candidates = staleSymbols(activeSymbols(db), latestBarDates(db), maxDate, staleDays);
  const deactivated: string[] = [];
  const kept: string[] = [];
  for (const s of candidates) {
    if (isWatchlisted(db, s)) {
      kept.push(s); // never auto-deactivate a watchlisted name
      continue;
    }
    if (setTickerActive(db, s, false)) deactivated.push(s);
  }
  const keptNote = kept.length ? `; kept ${kept.length} watchlisted stale (${kept.join(",")})` : "";
  return deactivated.length
    ? `universe_check: deactivated ${deactivated.length} stale (${deactivated.join(",")})${keptNote}`
    : `universe_check: no stale symbols past ${staleDays}d${keptNote}`;
}
