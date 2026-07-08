import { despike } from "./despike";
import { getTheme, THEMES, type Theme, type Subtheme } from "@engine/themes/taxonomy";
import {
  rankTheme,
  themeIntelligence,
  type RankInput,
  type RankedRow,
  type ThemeIntelligence,
} from "@engine/themes/rank";
import type { FundamentalsQuarter } from "@engine/screens/types";

// Server-only data loader for /themes: loads universe rows for a theme's sector
// codes and delegates ranking to the tested @engine/themes engine.
// Follows the ticker-data.ts openDb pattern (node:sqlite, read-only).

interface SqlDb {
  prepare(sql: string): {
    get(...args: unknown[]): Record<string, unknown> | undefined;
    all(...args: unknown[]): Record<string, unknown>[];
  };
  close?: () => void;
}

async function openDb(): Promise<SqlDb | null> {
  try {
    const mod = await import("node:sqlite");
    const file = (process.env.DATABASE_URL ?? "file:../data/engine.db").replace(/^file:/, "");
    const db = new mod.DatabaseSync(file, { readOnly: true });
    return db as unknown as SqlDb;
  } catch {
    return null;
  }
}

function closeDb(db: SqlDb): void {
  if (typeof db.close === "function") db.close();
}

export interface SubthemeNav {
  code: string;
  name: string;
  tickerCount: number;
  /** ~30 recent median closes across the subtheme, despiked, for the rail sparkline. */
  spark: number[];
}

export interface ThemeCatalystRow {
  d: string | null;
  kind: string;
  symbol: string | null;
  title: string;
}

export interface RankedDisplayRow extends RankedRow {
  name: string | null;
  watchlisted: boolean;
  triggerTags: string[];
  tier: number | null;
  close: number | null;
  buyUnder: number | null;
  valueLow: number | null;
  valueHigh: number | null;
}

export interface ThemeView {
  theme: Theme;
  subthemes: SubthemeNav[];
  intelligence: ThemeIntelligence;
  ranked: RankedDisplayRow[];
  silo: RankedDisplayRow[];
  warnings: string[];
  catalysts: ThemeCatalystRow[];
  /** Compare mode: present when ?compare=subA,subB parsed upstream. */
  compare?: { code: string; name: string; ranked: RankedDisplayRow[]; silo: RankedDisplayRow[] }[];
}

function computeEvToEbit(quarters: FundamentalsQuarter[], marketCap: number | null): number | null {
  if (quarters.length < 4 || marketCap === null || marketCap <= 0) return null;
  const ttm = quarters.slice(-4);
  let ebit = 0;
  for (const q of ttm) {
    if (q.operatingIncome === null || q.operatingIncome === undefined) return null;
    ebit += q.operatingIncome;
  }
  if (ebit <= 0) return null;
  const latest = ttm[ttm.length - 1];
  const ev = marketCap + (latest.totalDebt ?? 0) - (latest.cash ?? 0);
  return ev / ebit;
}

/** Symbols linked to any of the sector codes (deduped). */
function sectorSymbols(db: SqlDb, sectorCodes: string[]): Map<string, string> {
  const symbolToSubSector = new Map<string, string>();
  for (const code of sectorCodes) {
    const rows = db
      .prepare('SELECT "symbol" FROM "TickerSector" WHERE "sectorCode" = ?')
      .all(code);
    for (const r of rows) {
      const sym = r.symbol as string;
      if (!symbolToSubSector.has(sym)) symbolToSubSector.set(sym, code);
    }
  }
  return symbolToSubSector;
}

function loadRankInputs(db: SqlDb, symbols: string[]): RankInput[] {
  const inputs: RankInput[] = [];
  for (const symbol of symbols) {
    try {
      const gics = db
        .prepare('SELECT "sectorCode" FROM "TickerSector" WHERE "symbol"=? AND "sectorCode" LIKE \'g_%\' LIMIT 1')
        .get(symbol) as { sectorCode: string } | undefined;
      const quarters = db
        .prepare('SELECT * FROM "FundamentalsQuarter" WHERE "symbol"=? ORDER BY "periodEnd" ASC')
        .all(symbol) as unknown as FundamentalsQuarter[];
      const ticker = db
        .prepare('SELECT "marketCap" FROM "Ticker" WHERE "symbol"=?')
        .get(symbol) as { marketCap: number | null } | undefined;
      const priceRows = db
        .prepare('SELECT "close" FROM "Price" WHERE "symbol"=? ORDER BY "d" ASC')
        .all(symbol) as { close: number }[];
      const closes = despike(priceRows.map((r) => r.close));
      const marketCap = ticker?.marketCap ?? null;
      inputs.push({
        symbol,
        sectorCode: gics?.sectorCode ?? null,
        quarters,
        closes,
        marketCap,
        evToEbit: computeEvToEbit(quarters, marketCap),
      });
    } catch {
      // per-symbol failures never break the page
    }
  }
  return inputs;
}

function decorate(db: SqlDb, rows: RankedRow[]): RankedDisplayRow[] {
  return rows.map((row) => {
    let name: string | null = null;
    let watchlisted = false;
    let triggerTags: string[] = [];
    let tier: number | null = null;
    let close: number | null = null;
    let buyUnder: number | null = null;
    let valueLow: number | null = null;
    let valueHigh: number | null = null;
    try {
      const t = db
        .prepare('SELECT "name", "watchlisted" FROM "Ticker" WHERE "symbol"=?')
        .get(row.symbol) as { name: string | null; watchlisted: number } | undefined;
      name = t?.name ?? null;
      watchlisted = (t?.watchlisted ?? 0) === 1;
      const cand = db
        .prepare('SELECT "tier", "triggerTags" FROM "Candidate" WHERE "symbol"=?')
        .get(row.symbol) as { tier: number; triggerTags: string } | undefined;
      if (cand) {
        tier = cand.tier;
        try {
          triggerTags = JSON.parse(cand.triggerTags) as string[];
        } catch {
          triggerTags = [];
        }
      }
      const p = db
        .prepare('SELECT "close" FROM "Price" WHERE "symbol"=? ORDER BY "d" DESC LIMIT 1')
        .get(row.symbol) as { close: number } | undefined;
      close = p?.close ?? null;
      const w = db
        .prepare('SELECT "buyUnder", "valueLow", "valueHigh" FROM "WatchlistEntry" WHERE "symbol"=?')
        .get(row.symbol) as { buyUnder: number | null; valueLow: number | null; valueHigh: number | null } | undefined;
      buyUnder = w?.buyUnder ?? null;
      valueLow = w?.valueLow ?? null;
      valueHigh = w?.valueHigh ?? null;
    } catch {
      // decoration is best-effort
    }
    return { ...row, name, watchlisted, triggerTags, tier, close, buyUnder, valueLow, valueHigh };
  });
}

function subthemeNav(db: SqlDb, theme: Theme): SubthemeNav[] {
  return theme.subthemes.map((sub: Subtheme) => {
    const symbolMap = sectorSymbols(db, sub.sectorCodes);
    const symbols = Array.from(symbolMap.keys());
    // Median close per day across up to 8 members, last ~30 sessions, despiked.
    const sample = symbols.slice(0, 8);
    const seriesBySymbol = sample.map((sym) => {
      const rows = db
        .prepare('SELECT "close" FROM "Price" WHERE "symbol"=? ORDER BY "d" DESC LIMIT 30')
        .all(sym) as { close: number }[];
      return despike(rows.map((r) => r.close).reverse());
    });
    const maxLen = Math.max(0, ...seriesBySymbol.map((s) => s.length));
    const spark: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const vals = seriesBySymbol
        .map((s) => s[s.length - maxLen + i])
        .filter((v): v is number => v !== undefined && v !== null);
      if (vals.length === 0) continue;
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      spark.push(sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
    }
    return { code: sub.code, name: sub.name, tickerCount: symbols.length, spark };
  });
}

export function listThemes(): Theme[] {
  return THEMES;
}

/**
 * Full view for /themes/[code]. `subthemeFilter` narrows to one subtheme;
 * `compareCodes` renders two subthemes side-by-side.
 */
export async function themeView(
  themeCode: string,
  opts: { subtheme?: string; compare?: string[] } = {},
): Promise<ThemeView | null> {
  const theme = getTheme(themeCode);
  if (!theme) return null;
  const db = await openDb();
  if (!db) {
    return {
      theme,
      subthemes: theme.subthemes.map((s) => ({ code: s.code, name: s.name, tickerCount: 0, spark: [] })),
      intelligence: { aggregateValuationPctile: null, breadth: null, rankedCount: 0, siloCount: 0 },
      ranked: [],
      silo: [],
      warnings: ["database unavailable"],
      catalysts: [],
    };
  }
  try {
    const subthemes = subthemeNav(db, theme);

    const scopeCodes = opts.subtheme
      ? theme.subthemes.find((s) => s.code === opts.subtheme)?.sectorCodes ?? []
      : theme.subthemes.flatMap((s) => s.sectorCodes);
    const symbols = Array.from(sectorSymbols(db, scopeCodes).keys());
    const result = rankTheme(loadRankInputs(db, symbols));

    // 72h catalyst feed across the theme's symbols.
    const allSymbols = new Set(
      Array.from(sectorSymbols(db, theme.subthemes.flatMap((s) => s.sectorCodes)).keys()),
    );
    const cutoff = new Date(Date.now() - 72 * 3600 * 1000).toISOString().slice(0, 10);
    const catalysts = (
      db
        .prepare('SELECT "d", "kind", "symbol", "title" FROM "Catalyst" WHERE "d" >= ? ORDER BY "d" DESC LIMIT 40')
        .all(cutoff) as { d: string | null; kind: string; symbol: string | null; title: string }[]
    ).filter((c) => c.symbol === null || allSymbols.has(c.symbol));

    const view: ThemeView = {
      theme,
      subthemes,
      intelligence: themeIntelligence(result),
      ranked: decorate(db, result.ranked),
      silo: decorate(db, result.silo),
      warnings: result.warnings,
      catalysts,
    };

    if (opts.compare && opts.compare.length === 2) {
      view.compare = opts.compare.flatMap((code) => {
        const sub = theme.subthemes.find((s) => s.code === code);
        if (!sub) return [];
        const subSymbols = Array.from(sectorSymbols(db, sub.sectorCodes).keys());
        const subResult = rankTheme(loadRankInputs(db, subSymbols));
        return [{
          code: sub.code,
          name: sub.name,
          ranked: decorate(db, subResult.ranked),
          silo: decorate(db, subResult.silo),
        }];
      });
    }

    return view;
  } finally {
    closeDb(db);
  }
}
