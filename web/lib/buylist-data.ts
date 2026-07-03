// BuyList data layer. Reads BuyList and BuyListItem tables from SQLite DB.
// Server-only; routes using this are force-dynamic + nodejs runtime.
// Returns null/[] gracefully when the DB or tables are missing.

import { listRecCalls } from "./calibration-data";

export interface SavedBuyListItem {
  id: number;
  buyListMonth: string;
  rank: number;
  dossierId: string | null;
  symbol: string;
  plannedUsd: number;
  governedSizePct: number | null;
  governorReason: string | null;
  skipped: boolean;
  actualUsd: number | null;
  actualPrice: number | null;
  executedAt: string | null;
}

export interface SavedBuyList {
  month: string; // YYYY-MM
  status: string; // draft | final
  capitalUsd: number;
  createdAt: string;
  items: SavedBuyListItem[];
}

export interface CandidatePreview {
  symbol: string;
  dossierId: string;
  conviction: string;
  priceAtCall: number;
  judgeSizePct: number;
  governedSizePct: number;
  governorReason: string | null;
  ageDays: number;
  createdAt: string;
}

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

/**
 * Load the latest BuyList and its associated BuyListItems.
 * Returns null if tables are missing or empty.
 */
export async function getLatestBuyList(): Promise<SavedBuyList | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const listRow = db
      .prepare(
        'SELECT "month", "status", "capitalUsd", "createdAt" FROM "BuyList" ' +
          'ORDER BY "month" DESC LIMIT 1',
      )
      .get();
    if (!listRow) return null;

    const itemsRows = db
      .prepare(
        'SELECT "id", "buyListMonth", "rank", "dossierId", "symbol", "plannedUsd", ' +
          '"governedSizePct", "governorReason", "skipped", "actualUsd", "actualPrice", "executedAt" ' +
          'FROM "BuyListItem" WHERE "buyListMonth" = ? ORDER BY "rank" ASC',
      )
      .all(listRow.month);

    return {
      month: listRow.month as string,
      status: listRow.status as string,
      capitalUsd: listRow.capitalUsd as number,
      createdAt: listRow.createdAt as string,
      items: itemsRows.map((row) => ({
        id: row.id as number,
        buyListMonth: row.buyListMonth as string,
        rank: row.rank as number,
        dossierId: (row.dossierId as string) ?? null,
        symbol: row.symbol as string,
        plannedUsd: row.plannedUsd as number,
        governedSizePct: (row.governedSizePct as number) ?? null,
        governorReason: (row.governorReason as string) ?? null,
        skipped: Boolean(row.skipped),
        actualUsd: (row.actualUsd as number) ?? null,
        actualPrice: (row.actualPrice as number) ?? null,
        executedAt: (row.executedAt as string) ?? null,
      })),
    };
  } catch {
    // Return null gracefully if BuyList/BuyListItem tables do not exist
    return null;
  } finally {
    closeDb(db);
  }
}

/**
 * Fetch candidates preview: RecCalls with action = "BUY" within maxAgeDays.
 */
export async function getCandidatesPreview(maxAgeDays = 45): Promise<CandidatePreview[]> {
  const calls = await listRecCalls();
  const now = Date.now();

  return calls
    .filter((c) => {
      if ((c.action || "").toUpperCase() !== "BUY") return false;
      const createdTime = Date.parse(c.createdAt);
      if (isNaN(createdTime)) return false;
      const ageMs = now - createdTime;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      return ageDays <= maxAgeDays;
    })
    .map((c) => {
      const createdTime = Date.parse(c.createdAt);
      const ageMs = now - createdTime;
      const ageDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
      return {
        symbol: c.symbol,
        dossierId: c.dossierId,
        conviction: c.conviction,
        priceAtCall: c.priceAtCall,
        judgeSizePct: c.judgeSizePct,
        governedSizePct: c.governedSizePct,
        governorReason: c.governorReason,
        ageDays,
        createdAt: c.createdAt,
      };
    });
}
