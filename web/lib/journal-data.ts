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

export interface JournalEntryRow {
  id: number;
  symbol: string;
  action: string;
  thesis: string;
  invalidation: string | null;
  createdAt: string;
}

/** Return all JournalEntry rows newest-first. */
export async function listJournalEntries(): Promise<JournalEntryRow[]> {
  const db = await openDb();
  if (!db) return [];

  try {
    const rows = db.prepare(`
      SELECT id, symbol, action, thesis, invalidation, createdAt
      FROM JournalEntry
      ORDER BY createdAt DESC, id DESC
    `).all();

    return rows.map((r) => ({
      id: r.id as number,
      symbol: r.symbol as string,
      action: r.action as string,
      thesis: r.thesis as string,
      invalidation: (r.invalidation as string) ?? null,
      createdAt: r.createdAt as string,
    }));
  } catch (err) {
    console.error("Error in listJournalEntries:", err);
    return [];
  } finally {
    closeDb(db);
  }
}
