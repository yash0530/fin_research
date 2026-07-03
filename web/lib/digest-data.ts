// Reads Digest rows from the SQLite DB, following the story-data.ts pattern.
// Server-only; routes using this are force-dynamic + nodejs runtime.
// Returns null/[] gracefully when the DB or table is missing.

import type { DigestRow, DigestMeta, DigestJson } from "./digest-types";

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

function parseDigest(row: Record<string, unknown>): DigestRow {
  const dataJson =
    typeof row.dataJson === "string" ? row.dataJson : "{}";
  let data: DigestJson;
  try {
    data = JSON.parse(dataJson) as DigestJson;
  } catch {
    data = { asOf: "", headline: "", insights: [], counts: {} };
  }
  return {
    id: row.id as number,
    d: row.d as string,
    createdAt: (row.createdAt as string) ?? "",
    headline: data.headline ?? "",
    data,
    llmMd: (row.llmMd as string) ?? null,
  };
}

/**
 * Latest digest row (parsed). Returns null if DB or table is missing.
 */
export async function latestDigest(): Promise<DigestRow | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const row = db
      .prepare(
        'SELECT "id","d","createdAt","dataJson","llmMd" FROM "Digest" ORDER BY "createdAt" DESC, "id" DESC LIMIT 1',
      )
      .get();
    if (!row) return null;
    return parseDigest(row);
  } catch {
    return null;
  } finally {
    closeDb(db);
  }
}

/**
 * Digest for a specific date (d column). Returns null if not found.
 */
export async function digestByDate(d: string): Promise<DigestRow | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const row = db
      .prepare(
        'SELECT "id","d","createdAt","dataJson","llmMd" FROM "Digest" WHERE "d" = ? ORDER BY "id" DESC LIMIT 1',
      )
      .get(d);
    if (!row) return null;
    return parseDigest(row);
  } catch {
    return null;
  } finally {
    closeDb(db);
  }
}

/**
 * List recent digests (thin metadata, newest first).
 */
export async function listDigests(limit = 30): Promise<DigestMeta[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        'SELECT "id","d","dataJson" FROM "Digest" ORDER BY "createdAt" DESC, "id" DESC LIMIT ?',
      )
      .all(limit);
    return rows.map((row) => {
      let headline = "";
      try {
        const parsed = JSON.parse(row.dataJson as string) as DigestJson;
        headline = parsed.headline ?? "";
      } catch {
        /* empty */
      }
      return {
        id: row.id as number,
        d: row.d as string,
        headline,
      };
    });
  } catch {
    return [];
  } finally {
    closeDb(db);
  }
}
