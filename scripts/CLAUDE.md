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
- `scheduler.ts` — the scheduler daemon. `--once` evaluates a single decision tick and
  exits (verifiable); default runs the 60s tick loop with wake detection. Decisions come
  from the tested `src/schedule/wake`; the launchd agent is `deploy/com.engine.scheduler.plist`.
  Each tick also runs the llama-server watchdog (`src/schedule/watchdog.ts`): probe
  `:8000/health`, and when down past the cooloff, `launchctl bootstrap` + `kickstart -k`
  the `com.local.llamacpp` service.
- `seed.ts` — populates the DB (migrations + GICS 11 + AI-infra 12 sectors + the full
  S&P universe from `config/sp500.csv` with GICS links + additive AI-infra `ai_*` links +
  credit benchmarks + a sample digest) via `src/db/seed-helpers.seedUniverse`. Idempotent;
  prints ticker/sector/link counts. Run: `npm run seed`.
