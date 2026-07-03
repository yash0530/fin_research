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
- `scheduler.ts` — the scheduler daemon that runs the platform itself. `--once` runs ONE
  **read-only** decision pass (reads the latest Digest date via `src/schedule/tick`.
  `evaluateCatchUp`, prints `shouldCatchUp`, and exits 0 with NO side effects — the
  verification gate; in normal operation today's digest exists so it short-circuits).
  The default long-lived 60s loop calls `schedulerTick`: in the morning window with no
  digest for today it runs the `overnight` chain (one JobRun/step) then the daily
  `backup`; when idle it `recoverStale` + drains the dossier queue (`drainDossierQueueLive`,
  one at a time, respects the llama lock). A mutex prevents a slow tick from double-firing;
  it detects a wake (long inter-tick gap), heartbeats every 10 ticks, and each tick probes
  `:8000/health` and — when down past cooloff — `launchctl bootstrap` + `kickstart -k` the
  `com.local.llamacpp` service (`src/schedule/watchdog.ts`). The LIVE jobs come from the
  shared `src/jobs/registry-live` (same code path as `job.ts`); the launchd agent +
  installer are in `deploy/`.
- `seed.ts` — populates the DB (migrations + GICS 11 + AI-infra 12 sectors + the full
  S&P universe from `config/sp500.csv` with GICS links + additive AI-infra `ai_*` links +
  credit benchmarks + a sample digest) via `src/db/seed-helpers.seedUniverse`. Idempotent;
  the sample digest is **create-if-absent** (re-seeding never grows the Digest table);
  prints ticker/sector/link counts. Run: `npm run seed`.
- `job.ts` — the **job CLI**. `npm run job -- <name> [--symbols=A,B]` runs any registered
  job against `DATABASE_URL`; prints a per-job summary + a 0/1 exit code. `--list` prints
  the registry with NO DB or network. The registry, env/DB open, and live yahoo2/Stooq/
  EDGAR/HttpProvider wiring now live in the shared `src/jobs/registry-live` (so the
  scheduler runs the same code path); `--list` uses `jobCatalog()` (no DB). Registered:
  `prices10y`, `fundamentals`, `edgar_index`, `stats`, `news`, `earnings`, `rules`,
  `digest`, `overnight`, `dossier`, `backup`. The `dossier` job
  (`npm run job -- dossier --symbols=MU[,NVDA]`) enqueues (deduped) then runs the live
  multi-agent deep dive one at a time — HttpProvider from `resolveProfile(role)` + real
  yahoo2 fetchers (quotes/ownership) for the live tools; the flow itself lives in the
  testable `src/dossier/job.runDossierJob`. With no `--symbols` it drains the existing
  queue only.
