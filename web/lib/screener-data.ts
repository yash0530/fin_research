import { despike } from "./despike";
import { rsi } from "@engine/tools/technicals";
import type { TickerRow } from "@engine/screener/engine";

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
    const file = (
      process.env.DATABASE_URL ?? "file:../data/engine.db"
    ).replace(/^file:/, "");
    const db = new mod.DatabaseSync(file, { readOnly: true });
    return db as unknown as SqlDb;
  } catch {
    return null;
  }
}

function closeDb(db: SqlDb): void {
  if (typeof db.close === "function") db.close();
}

export type ScreenerRow = TickerRow & {
  name: string | null;
  aiCodes: string[];
};

export async function getScreenerRows(): Promise<ScreenerRow[]> {
  const db = await openDb();
  if (!db) return [];

  try {
    // 1. Fetch all active tickers
    const tickerRows = db.prepare(`
      SELECT symbol, name, source, watchlisted, marketCap, forwardPE, trailingPE, profitMargin, revenueGrowth, beta, yearChange, fiftyTwoWeekHigh
      FROM Ticker
      WHERE active = 1
    `).all();

    // 2. Fetch sector mappings
    const sectorRows = db.prepare(`
      SELECT ts.symbol, ts.sectorCode, s.taxonomy
      FROM TickerSector ts
      JOIN Sector s ON ts.sectorCode = s.code
    `).all();

    // Group sectors by symbol
    const sectorsMap = new Map<string, { gicsCode: string | undefined; aiCodes: string[] }>();
    for (const r of sectorRows) {
      const sym = r.symbol as string;
      const secCode = r.sectorCode as string;
      const taxonomy = r.taxonomy as string;

      if (!sectorsMap.has(sym)) {
        sectorsMap.set(sym, { gicsCode: undefined, aiCodes: [] });
      }
      const entry = sectorsMap.get(sym)!;
      if (taxonomy === "gics") {
        entry.gicsCode = secCode;
      } else if (taxonomy === "ai_infra") {
        entry.aiCodes.push(secCode);
      }
    }

    // 3. Fetch recent 50 prices for all symbols for RSI calculation
    const priceRows = db.prepare(`
      WITH RankedPrices AS (
        SELECT symbol, close, d,
               ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY d DESC) as rn
        FROM Price
      )
      SELECT symbol, close, d
      FROM RankedPrices
      WHERE rn <= 50
    `).all();

    // Group prices by symbol (order by date desc first, then we group them and reverse)
    const pricesMap = new Map<string, number[]>();
    const latestCloseMap = new Map<string, number>();

    for (const r of priceRows) {
      const sym = r.symbol as string;
      const val = r.close as number;

      if (!pricesMap.has(sym)) {
        pricesMap.set(sym, []);
        latestCloseMap.set(sym, val);
      }
      pricesMap.get(sym)!.push(val);
    }

    // Process rows
    return tickerRows.map((row) => {
      const sym = row.symbol as string;
      const sectorEntry = sectorsMap.get(sym) ?? { gicsCode: undefined, aiCodes: [] };

      // Reverse prices to be chronological (oldest to newest)
      const revPrices = pricesMap.get(sym) ?? [];
      const chronologicalPrices = [...revPrices].reverse();

      // Compute RSI
      let rsiVal: number | null = null;
      if (chronologicalPrices.length > 14) {
        const despiked = despike(chronologicalPrices);
        rsiVal = rsi(despiked, 14);
      }

      // Compute pctFrom52wHighPct
      const latestClose = latestCloseMap.get(sym) ?? null;
      const fiftyTwoWeekHigh = row.fiftyTwoWeekHigh !== null ? (row.fiftyTwoWeekHigh as number) : null;
      let pctFrom52wHighPct: number | null = null;
      if (latestClose !== null && fiftyTwoWeekHigh !== null && fiftyTwoWeekHigh > 0) {
        pctFrom52wHighPct = ((latestClose - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100;
      }

      return {
        symbol: sym,
        name: (row.name as string) ?? null,
        source: (row.source as string) ?? undefined,
        watchlisted: (row.watchlisted as number) === 1,
        gicsCode: sectorEntry.gicsCode,
        aiCodes: sectorEntry.aiCodes,
        marketCap: row.marketCap !== null ? (row.marketCap as number) : null,
        forwardPE: row.forwardPE !== null ? (row.forwardPE as number) : null,
        trailingPE: row.trailingPE !== null ? (row.trailingPE as number) : null,
        revenueGrowthPct: row.revenueGrowth !== null ? (row.revenueGrowth as number) : null,
        profitMarginPct: row.profitMargin !== null ? (row.profitMargin as number) : null,
        beta: row.beta !== null ? (row.beta as number) : null,
        yearChangePct: row.yearChange !== null ? (row.yearChange as number) : null,
        rsi: rsiVal,
        pctFrom52wHighPct,
      };
    });
  } catch (err) {
    console.error("Error in getScreenerRows:", err);
    return [];
  } finally {
    closeDb(db);
  }
}
