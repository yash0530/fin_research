// `earnings` job: pull upcoming earnings dates (yahoo2 calendarEvents) over the
// watchlist + AI-infra symbols and upsert them as `earnings` Catalyst rows. Deduped
// by (kind, symbol, d) so re-running never grows the table. Never-crash: the fetcher
// is injected and a per-symbol failure is caught (catch-per-item).

import type { SqlDb } from "../db/migrate";
import { upsertCatalyst } from "../db/queries";

export type EarningsHit = { symbol: string; d: string };

export type EarningsDeps = {
  symbols: string[];
  /** Fetch upcoming earnings dates for a symbol. May throw — caught per symbol. */
  fetchEarnings: (symbol: string) => Promise<EarningsHit[]>;
};

export async function runEarningsJob(db: SqlDb, deps: EarningsDeps): Promise<string> {
  if (deps.symbols.length === 0) return "no symbols for earnings scan";
  let added = 0;
  let seen = 0;
  let errors = 0;
  for (const symbol of deps.symbols) {
    try {
      const hits = await deps.fetchEarnings(symbol);
      for (const h of hits) {
        seen += 1;
        const ok = upsertCatalyst(db, {
          d: h.d,
          kind: "earnings",
          symbol: h.symbol,
          title: `${h.symbol.toUpperCase()} earnings`,
        });
        if (ok) added += 1;
      }
    } catch {
      errors += 1;
    }
  }
  return `earnings: ${added} new catalysts (${seen} dates over ${deps.symbols.length} symbols${errors ? `, ${errors} errors` : ""})`;
}
