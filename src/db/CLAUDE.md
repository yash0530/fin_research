# src/db/ — migration runner

- `migrate.ts` — `applyMigrations(db, migrations)`: applies only un-applied migrations
  (tracked in a `_migrations` table), idempotent, returns the newly-applied names.
  DB-agnostic via the tiny `SqlDb` interface (`exec` / `prepare`), so it's unit-tested
  with Node's built-in `node:sqlite`. `appliedMigrations(db)` lists what's applied.

The CLI wrapper is `scripts/apply-migration.ts` (opens the DATABASE_URL file, sets
WAL + busy_timeout, applies `prisma/migrations/*.sql` in order).

## Tests

`migrate.test.ts` applies the real `prisma/migrations/0001_init.sql` to an in-memory
SQLite DB and asserts **all 30 tables materialize**, that a re-run is a no-op
(idempotent), and that a row inserts + reads back (the schema is actually usable).
This verifies the full path: `schema.prisma` → `0001_init.sql` → a working database.
