// Daily SQLite backup job. `VACUUM INTO` writes a consistent, defragmented copy
// of the live DB to data/backups/engine-YYYY-MM-DD.db (safe to run while the DB is
// in use — it's a read snapshot), then prunes to the newest N (default 14). The
// retention math is a pure function over the filenames so it's unit-testable with
// temp files, and the whole job is never-crash (a failure returns a detail string,
// never throws into the scheduler).

import { mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SqlDb } from "../db/migrate";

/** engine-YYYY-MM-DD.db — dated so lexical sort == chronological sort. */
const BACKUP_RE = /^engine-\d{4}-\d{2}-\d{2}\.db$/;

export function backupFileName(date: Date = new Date()): string {
  return `engine-${date.toISOString().slice(0, 10)}.db`;
}

/** Existing backup filenames in `dir`, oldest→newest. Missing dir ⇒ []. */
export function listBackups(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => BACKUP_RE.test(f))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Keep the newest `keep` backups in `dir`, deleting the rest. Pure over the
 * filesystem listing; returns the filenames removed. Never throws.
 */
export function pruneBackups(dir: string, keep = 14): string[] {
  const all = listBackups(dir); // ascending: oldest first
  if (all.length <= keep) return [];
  const toRemove = all.slice(0, all.length - keep);
  const removed: string[] = [];
  for (const f of toRemove) {
    try {
      unlinkSync(join(dir, f));
      removed.push(f);
    } catch {
      /* a straggler we can't delete is not worth crashing the daemon over */
    }
  }
  return removed;
}

export type BackupOpts = {
  /** Backup directory (default data/backups). */
  dir?: string;
  /** How many dated backups to retain (default 14). */
  keep?: number;
  /** Injectable clock for deterministic filenames in tests. */
  now?: () => Date;
};

/**
 * `VACUUM INTO` today's dated backup file, then prune to the newest `keep`.
 * Same-day re-run overwrites today's file (VACUUM INTO refuses an existing path,
 * so we unlink first). Never throws — returns a human detail string.
 */
export function runBackupJob(db: SqlDb, opts: BackupOpts = {}): string {
  const dir = opts.dir ?? "data/backups";
  const keep = opts.keep ?? 14;
  const date = (opts.now ?? (() => new Date()))();
  try {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, backupFileName(date));
    if (existsSync(file)) unlinkSync(file); // idempotent daily overwrite
    // VACUUM INTO takes a single-quoted string literal path; escape embedded quotes.
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const removed = pruneBackups(dir, keep);
    return `backup → ${file}${removed.length ? ` (pruned ${removed.length}, kept ${keep})` : ""}`;
  } catch (e) {
    return `backup failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}
