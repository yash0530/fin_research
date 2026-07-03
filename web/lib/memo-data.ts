// Read layer for the living-memo pages. Server-only; dynamic node:sqlite import
// (same pattern as the other lib readers). Never throws on a missing DB/table.
import type { SqlDb } from "@engine/db/migrate";

async function openDb(): Promise<SqlDb | null> {
  try {
    const mod = await import("node:sqlite");
    const file = (process.env.DATABASE_URL ?? "file:../data/engine.db").replace(/^file:/, "");
    return new mod.DatabaseSync(file, { readOnly: true }) as unknown as SqlDb;
  } catch {
    return null;
  }
}

export const MEMO_SECTIONS = [
  "identity",
  "moat",
  "long_term_thesis",
  "current_state",
  "management_track_record",
  "risk_register",
  "open_questions",
  "recent_observations",
  "past_verdicts",
  "anti_thesis",
] as const;

export type MemoVersionRow = {
  id: number;
  symbol: string;
  version: number;
  content: Record<string, string>;
  state: string;
  deltaSummary: string | null;
  sourceDossierId: string | null;
  createdAt: string;
};

function parse(row: {
  id: number;
  symbol: string;
  version: number;
  contentJson: string;
  state: string;
  deltaSummary: string | null;
  sourceDossierId: string | null;
  createdAt: string;
}): MemoVersionRow {
  let content: Record<string, string> = {};
  try {
    content = JSON.parse(row.contentJson) as Record<string, string>;
  } catch {
    /* leave empty */
  }
  return { ...row, content };
}

export async function memoVersionsFor(symbol: string): Promise<MemoVersionRow[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const rows = db
      .prepare('SELECT * FROM "MemoVersion" WHERE "symbol"=? ORDER BY "version" DESC')
      .all(symbol.toUpperCase()) as Parameters<typeof parse>[0][];
    return rows.map(parse);
  } catch {
    return [];
  }
}

export type MemoIndexRow = { symbol: string; version: number; updatedAt: string; stagedCount: number };

export async function memoIndex(): Promise<MemoIndexRow[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    return db
      .prepare(
        `SELECT m."symbol" AS symbol, m."version" AS version, m."updatedAt" AS updatedAt,
                (SELECT COUNT(*) FROM "MemoVersion" v WHERE v."symbol"=m."symbol" AND v."state"='staged') AS stagedCount
           FROM "Memo" m ORDER BY m."updatedAt" DESC`,
      )
      .all() as MemoIndexRow[];
  } catch {
    return [];
  }
}

/** Symbols with staged versions but no active Memo yet (pure review queue). */
export async function stagedOnlySymbols(): Promise<{ symbol: string; stagedCount: number }[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    return db
      .prepare(
        `SELECT "symbol", COUNT(*) AS stagedCount FROM "MemoVersion"
          WHERE "state"='staged' AND "symbol" NOT IN (SELECT "symbol" FROM "Memo")
          GROUP BY "symbol" ORDER BY MAX("createdAt") DESC`,
      )
      .all() as { symbol: string; stagedCount: number }[];
  } catch {
    return [];
  }
}
