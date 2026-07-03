// Higher-level, idempotent universe seeding built on the low-level data-access
// helpers in ./queries. `seedUniverse` seeds the full market: every S&P row as a
// Ticker linked to its GICS Sector, then the AI-infra membership as ADDITIVE `ai_*`
// links (deduped; a ticker already present as an S&P name keeps that name), plus the
// credit-proxy benchmark tickers. Re-running upserts, so the seed stays idempotent.

import type { SqlDb } from "./migrate";
import { upsertTicker, linkTickerSector } from "./queries";
import type { UniverseRow } from "../lib/universe";

export type SeedUniverseInput = {
  /** Parsed S&P universe rows (from parseUniverseCsv). */
  universe: UniverseRow[];
  /** Flattened AI-infra membership links (from aiInfraLinks()). */
  aiLinks: { symbol: string; code: string }[];
  /** Optional display names for symbols not present in the S&P universe. */
  names?: Record<string, string>;
  /** Credit-proxy / benchmark tickers that belong to no sector. */
  benchmarks?: { symbol: string; name: string }[];
};

export type SeedUniverseResult = {
  spTickers: number; // S&P rows upserted
  spLinks: number; // GICS links attempted (rows with a mapped code)
  unmappedGics: number; // S&P rows whose sector name did not map
  aiTickers: number; // distinct AI symbols not already in the S&P universe
  aiLinks: number; // ai_* links attempted (deduped)
  benchmarkTickers: number; // benchmark tickers upserted
};

/** Seed the full universe. Idempotent (upserts + INSERT OR IGNORE links). */
export function seedUniverse(db: SqlDb, input: SeedUniverseInput): SeedUniverseResult {
  const result: SeedUniverseResult = {
    spTickers: 0,
    spLinks: 0,
    unmappedGics: 0,
    aiTickers: 0,
    aiLinks: 0,
    benchmarkTickers: 0,
  };

  const spSymbols = new Set<string>();
  for (const row of input.universe) {
    const symbol = row.symbol.toUpperCase();
    upsertTicker(db, { symbol, name: row.name || undefined, source: "sp500" });
    spSymbols.add(symbol);
    result.spTickers += 1;
    if (row.gicsCode) {
      linkTickerSector(db, symbol, row.gicsCode);
      result.spLinks += 1;
    } else {
      result.unmappedGics += 1;
    }
  }

  // AI-infra: additive. Only create a bare Ticker for AI-only symbols so an existing
  // S&P name is never clobbered with null; symbols already seeded just get the link.
  const seededAiOnly = new Set<string>();
  for (const { symbol: raw, code } of input.aiLinks) {
    const symbol = raw.toUpperCase();
    if (!spSymbols.has(symbol) && !seededAiOnly.has(symbol)) {
      upsertTicker(db, { symbol, name: input.names?.[symbol], source: "ai_infra" });
      seededAiOnly.add(symbol);
      result.aiTickers += 1;
    }
    linkTickerSector(db, symbol, code);
    result.aiLinks += 1;
  }

  for (const b of input.benchmarks ?? []) {
    const symbol = b.symbol.toUpperCase();
    if (!spSymbols.has(symbol) && !seededAiOnly.has(symbol)) {
      upsertTicker(db, { symbol, name: b.name, source: "benchmark" });
      result.benchmarkTickers += 1;
    }
  }

  return result;
}
