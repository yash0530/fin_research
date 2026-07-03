// WRITABLE engine-DB opener — the ONLY write entry in the web app (used by the
// capture server actions). Same dynamic-import pattern as lib/live.ts, but
// read-write with the repo's WAL/busy_timeout discipline. Server-only.
import type { SqlDb } from "@engine/db/migrate";

export async function openWritableDb(): Promise<SqlDb | null> {
  try {
    const mod = await import("node:sqlite");
    const file = (process.env.DATABASE_URL ?? "file:../data/engine.db").replace(/^file:/, "");
    const db = new mod.DatabaseSync(file) as unknown as SqlDb;
    db.exec("PRAGMA busy_timeout=8000;");
    return db;
  } catch {
    return null;
  }
}
