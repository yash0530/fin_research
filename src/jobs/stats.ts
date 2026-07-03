// `stats` job: refresh the Ticker stat columns (marketCap, PE, margins, 52w range,
// beta, eps, yearChange) from batched yahoo2 quote() calls (≤100 symbols/request).
// Never-crash: a failed batch is caught by the injected fetcher; a bad row never
// aborts the rest (catch-per-item on the upsert). The fetcher is injected so the
// test drives it with canned QuoteStats and no network.

import type { SqlDb } from "../db/migrate";
import { upsertTickerStats, type TickerStatUpdate } from "../db/queries";

export type StatsDeps = {
  symbols: string[];
  /** Fetch per-symbol stat rows for a symbol list (chunking handled inside). */
  fetchQuotes: (symbols: string[]) => Promise<TickerStatUpdate[]>;
};

export async function runStatsJob(db: SqlDb, deps: StatsDeps): Promise<string> {
  if (deps.symbols.length === 0) return "no active tickers to refresh";
  let rows: TickerStatUpdate[];
  try {
    rows = await deps.fetchQuotes(deps.symbols);
  } catch (e) {
    return `stats fetch failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  let updated = 0;
  let errors = 0;
  for (const r of rows) {
    try {
      if (upsertTickerStats(db, r) > 0) updated += 1;
    } catch {
      errors += 1;
    }
  }
  return `stats: ${updated}/${deps.symbols.length} tickers updated (${rows.length} quotes${errors ? `, ${errors} write errors` : ""})`;
}
