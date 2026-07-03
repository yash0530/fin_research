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

export interface DiscoveryCandidateRow {
  symbol: string;
  source: string;
  status: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  note: string | null;
}

export async function listDiscoveryCandidates(): Promise<DiscoveryCandidateRow[]> {
  const db = await openDb();
  if (!db) return [];

  try {
    const rows = db.prepare(`
      SELECT symbol, source, status, occurrences, firstSeen, lastSeen, note
      FROM DiscoveryCandidate
      ORDER BY lastSeen DESC, symbol ASC
    `).all();

    return rows.map((r) => ({
      symbol: r.symbol as string,
      source: r.source as string,
      status: r.status as string,
      occurrences: r.occurrences as number,
      firstSeen: r.firstSeen as string,
      lastSeen: r.lastSeen as string,
      note: (r.note as string) ?? null,
    }));
  } catch (err) {
    console.error("Error in listDiscoveryCandidates:", err);
    return [];
  } finally {
    closeDb(db);
  }
}
