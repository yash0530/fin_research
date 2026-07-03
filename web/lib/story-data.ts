// Reads StoryPage rows from the SQLite DB, following the lib/live.ts pattern.
// Server-only; routes using this are force-dynamic + nodejs runtime.
// Returns null/[] gracefully when the DB or table is missing.

import type { StoryPageData } from "./story-types";

interface SqlDb {
  prepare(sql: string): { get(...args: unknown[]): Record<string, unknown> | undefined; all(...args: unknown[]): Record<string, unknown>[] };
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

export interface StoryPageRow {
  id: string;
  symbol: string;
  title: string;
  createdAt: string;
}

/**
 * Load a single story page's data from the DB. Returns null if the DB, table,
 * or row doesn't exist.
 */
export async function loadStoryPage(id: string): Promise<StoryPageData | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const stmt = db.prepare("SELECT storyJson FROM StoryPage WHERE id = ?");
    const row = stmt.get(id);
    if (!row || typeof row.storyJson !== "string") return null;
    return JSON.parse(row.storyJson) as StoryPageData;
  } catch {
    return null;
  }
}

/**
 * List all story pages (id, symbol, title, createdAt), newest first.
 * Returns [] if the DB or table is missing.
 */
export async function listStoryPages(): Promise<StoryPageRow[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const stmt = db.prepare(
      "SELECT id, symbol, title, createdAt FROM StoryPage ORDER BY createdAt DESC"
    );
    const rows = stmt.all();
    return rows.map((r) => ({
      id: String(r.id),
      symbol: String(r.symbol),
      title: String(r.title),
      createdAt: String(r.createdAt),
    }));
  } catch {
    return [];
  }
}
