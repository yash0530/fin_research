import type { SqlDb } from "@engine/db/migrate";
import { loadLatestDigest } from "@engine/db/queries";

// Live-data reader for the Next app. Opens the SQLite DB via a DYNAMIC import of
// node:sqlite (evades bundler static analysis) and reads through the tested engine
// data layer. Returns null if the DB isn't present yet (page shows a fallback).
// Server-only; routes using it are force-dynamic + nodejs runtime.

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

export type LiveDigest = { id: number; d: string; dataJson: string; llmMd: string | null } | null;

export async function getLiveDigest(): Promise<LiveDigest> {
  const db = await openDb();
  if (!db) return null;
  try {
    return loadLatestDigest(db);
  } finally {
    (db as unknown as { close: () => void }).close();
  }
}
