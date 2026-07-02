// Additive migration runner core. DB-agnostic via a tiny SqlDb interface so it is
// unit-testable (the test drives it with Node's built-in node:sqlite). Applies
// only un-applied migrations, tracked in a `_migrations` table. Idempotent.
// The CLI wrapper is scripts/apply-migration.ts.

export interface SqlStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
}

export interface SqlDb {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
}

export type Migration = { name: string; sql: string };

/**
 * Apply each migration not already recorded, in order. Returns the names newly
 * applied (empty on a no-op re-run). Each migration's SQL runs as one `exec`.
 */
export function applyMigrations(db: SqlDb, migrations: Migration[]): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const rows = db.prepare("SELECT name FROM _migrations").all() as { name: string }[];
  const done = new Set(rows.map((r) => r.name));

  const insert = db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)");
  const newlyApplied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    db.exec(m.sql);
    insert.run(m.name, new Date().toISOString());
    newlyApplied.push(m.name);
  }
  return newlyApplied;
}

/** Names of applied migrations, in insertion order. */
export function appliedMigrations(db: SqlDb): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const rows = db
    .prepare("SELECT name FROM _migrations ORDER BY applied_at, name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}
