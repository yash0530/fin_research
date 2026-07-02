# scripts/ — tooling

Standalone `tsx` scripts (not part of the library build).

## Files

- `check-claude-md.ts` — walks the repo (skipping `node_modules`, `.git`, `dist`,
  `coverage`, `__fixtures__`) and asserts every directory contains a `CLAUDE.md`.
  Exits non-zero listing offenders. Run via `npm run check:claude`; part of
  `npm run verify`. This is what enforces the "CLAUDE.md everywhere" invariant.

- `apply-migration.ts` — opens the `DATABASE_URL` SQLite file, sets `PRAGMA journal_mode=WAL`
  + `busy_timeout=8000`, and applies pending `prisma/migrations/*.sql` in order via the
  runner in `src/db/migrate.ts`. Additive-only, idempotent, tracked in `_migrations`.
  Run: `tsx scripts/apply-migration.ts`.
- `smoke.ts` — end-to-end smoke of the deterministic pipeline (digest → screener →
  FakeProvider dossier → governed buy-list); prints ✓/✗ and exits non-zero on failure.
  Run: `npm run smoke`.
