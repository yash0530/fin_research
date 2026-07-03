# src/db/ — migration runner

- `migrate.ts` — `applyMigrations(db, migrations)`: applies only un-applied migrations
  (tracked in a `_migrations` table), idempotent, returns the newly-applied names.
  DB-agnostic via the tiny `SqlDb` interface (`exec` / `prepare`), so it's unit-tested
  with Node's built-in `node:sqlite`. `appliedMigrations(db)` lists what's applied.

The CLI wrapper is `scripts/apply-migration.ts` (opens the DATABASE_URL file, sets
WAL + busy_timeout, applies `prisma/migrations/*.sql` in order).

- `sqlite-store.ts` — `SqliteDossierStore` implements the dossier engine's `DossierStore`
  interface over the injectable `SqlDb`, persisting `DossierState` to a self-managed table.
  It's the **durable** store (InMemory is the test double) — proving dossiers survive a
  restart and resume against a real database.
- `queries.ts` — data-access layer over `SqlDb`: `insertPrices` (chunked INSERT OR IGNORE),
  `loadCloses` (**despiked on read**), `saveDigest`/`loadLatestDigest`, `saveRecCall`/
  `loadRecCallsForGovernor`/`updateRecCallOutcome`, `insertRuleEvent`/`recentRuleEvents`
  (tripwire fires — the RuleEvent table is ensured idempotently at runtime since the
  frozen prisma schema does not yet carry it), and the **market-input reads**
  (`maxPriceDate`, `closesSince`, `latestBarDates`, `recentTradingDates`,
  `activeSectorMemberships`) that feed `src/research/market-inputs.buildMarketInputs`
  (bulk/dated scans `loadCloses` can't express; the caller despikes). Tested against a
  DB seeded from `0001_init.sql`.
- `seed-helpers.ts` — `seedUniverse(db, {universe, aiLinks, benchmarks})`: idempotent
  full-market seeding — every S&P row → Ticker + GICS link, additive `ai_*` links (an
  existing S&P name is never clobbered), plus sector-less benchmark tickers.

## Tests

`migrate.test.ts` applies the real `prisma/migrations/0001_init.sql` to an in-memory
SQLite DB and asserts **all 30 tables materialize**, that a re-run is a no-op
(idempotent), and that a row inserts + reads back (the schema is actually usable).
This verifies the full path: `schema.prisma` → `0001_init.sql` → a working database.
