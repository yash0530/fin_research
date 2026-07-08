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

export interface JournalEntryView extends JournalEntryRow {
  /** Frozen DecisionSnapshot payload for this entry (matched by symbol + exact
   *  createdAt, since both rows are written in the same transaction) — rendered
   *  as-is, NEVER recomputed against live prices. Null when no snapshot exists
   *  (e.g. an older manual note predating the freeze). */
  snapshot: Record<string, unknown> | null;
  quarter: string; // e.g. "2026-Q3"
}

export interface MistakeBucket {
  action: string;
  count: number;
}

/** Quarter label ("YYYY-Qn") for an ISO datetime string. */
function quarterOf(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

/** Entries decorated with their frozen DecisionSnapshot payload + quarter label. */
export async function listJournalEntriesWithSnapshots(): Promise<JournalEntryView[]> {
  const entries = await listJournalEntries();
  const db = await openDb();
  if (!db) return entries.map((e) => ({ ...e, snapshot: null, quarter: quarterOf(e.createdAt) }));
  try {
    return entries.map((e) => {
      let snapshot: Record<string, unknown> | null = null;
      try {
        const row = db
          .prepare('SELECT "payload" FROM "DecisionSnapshot" WHERE "symbol"=? AND "createdAt"=? ORDER BY "id" DESC LIMIT 1')
          .get(e.symbol, e.createdAt) as { payload: string } | undefined;
        if (row?.payload) snapshot = JSON.parse(row.payload);
      } catch {
        snapshot = null;
      }
      return { ...e, snapshot, quarter: quarterOf(e.createdAt) };
    });
  } catch (err) {
    console.error("Error decorating journal entries with snapshots:", err);
    return entries.map((e) => ({ ...e, snapshot: null, quarter: quarterOf(e.createdAt) }));
  } finally {
    closeDb(db);
  }
}

/**
 * Mistake taxonomy board: for each JournalEntry, find the RecCall for the same
 * symbol closest at-or-before the entry's createdAt. When that call resolved with
 * `thesisFalsified=true`, the entry's action is counted as a mistake bucket.
 * Purely mechanical (no LLM judgment) — a deterministic cross-reference.
 */
export async function mistakeTaxonomy(): Promise<MistakeBucket[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const entries = db
      .prepare('SELECT "symbol","action","createdAt" FROM "JournalEntry" ORDER BY "createdAt" ASC')
      .all() as { symbol: string; action: string; createdAt: string }[];
    const calls = db
      .prepare('SELECT "symbol","createdAt","thesisFalsified" FROM "RecCall" WHERE "thesisFalsified" IS NOT NULL ORDER BY "createdAt" ASC')
      .all() as { symbol: string; createdAt: string; thesisFalsified: number }[];

    const buckets = new Map<string, number>();
    for (const entry of entries) {
      const priorCalls = calls.filter((c) => c.symbol === entry.symbol && c.createdAt <= entry.createdAt);
      if (priorCalls.length === 0) continue;
      const nearest = priorCalls[priorCalls.length - 1];
      if (nearest.thesisFalsified === 1) {
        buckets.set(entry.action, (buckets.get(entry.action) ?? 0) + 1);
      }
    }
    return Array.from(buckets.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);
  } catch (err) {
    console.error("Error computing mistake taxonomy:", err);
    return [];
  } finally {
    closeDb(db);
  }
}
