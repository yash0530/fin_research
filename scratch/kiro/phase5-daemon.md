# Kiro batch F — Daemon reality: scheduler wired live + launchd + backups (NEXT_RUN Phase 5)

## Intent
`scripts/scheduler.ts` currently evaluates decisions against null state (skeleton).
Wire it to the REAL system so the platform runs itself: morning catch-up executes the
real overnight chain, idle ticks drain the dossier queue, llama watchdog stays, and
launchd + backups make it production. Reuse everything; invent nothing.

## Verified context
- Decision logic tested: src/schedule/wake.ts (+ watchdog.ts). Watchdog wiring exists
  in scheduler.ts (keep it).
- Jobs live in scripts/job.ts's registry — REFACTOR that registry assembly into a
  reusable module (e.g. src/jobs/registry-live.ts exporting buildLiveRegistry(db) +
  the run helpers) so BOTH the CLI and the scheduler share one code path. The CLI's
  behavior must not change (same commands, same output).
- Dossier queue: src/dossier/queue.ts (drainOnce, recoverStale) + runDossierJob.
- Digest date guard: hasTodaysDigest reads latest Digest row (queries has the read).
- KNOWN NIT to fix here: saveDigest inserts a new row per run → duplicate rows per
  date. Make it upsert-by-date (additive SQL is fine; the table has id+d).

## Deliverables
1. NEW `src/jobs/registry-live.ts` (+ test): the shared live-registry assembly
   extracted from scripts/job.ts (CLI imports it; scheduler imports it).
2. EDIT `scripts/scheduler.ts`: real tick loop —
   - opens the DB (same .env loading as job.ts — extract that too if cleanest),
   - morning window + no-digest-today → run the overnight chain (one JobRun row per
     step, as the CLI does), with a mutex so ticks never double-fire,
   - when idle (no chain running) → recoverStale() then drainOnce() the dossier
     queue (live providers; respects the llama lock),
   - keeps watchdog + wake detection; heartbeat log line every 10 ticks,
   - `--once` still exits after one full decision pass (with real DB reads).
3. NEW `src/jobs/backup.ts` + `backup` job in the registry: `VACUUM INTO
   data/backups/engine-YYYY-MM-DD.db`, keep newest 14, never crash; scheduler runs
   it daily after the chain.
4. EDIT `src/db/queries.ts` saveDigest → upsert by date (delete+insert or ON CONFLICT).
   Clean up today's duplicate rows via the upsert path naturally (no manual migration).
5. NEW `deploy/com.engine.scheduler.plist` (RunAtLoad + KeepAlive, logs to
   data/logs/scheduler.log) + `deploy/install-launchd.sh` (bootstrap gui domain,
   idempotent, prints status) + deploy/CLAUDE.md.
6. Tests (network-free): registry-live assembly; scheduler decision pass with a
   fixture DB (digest-today short-circuits; no-digest triggers chain fn — injected
   fakes; idle path calls drain fn); backup retention logic with temp files.
7. CLAUDE.md updates: scripts, src/jobs, src/schedule.

## Hard constraints
Do NOT touch: web/**, scratch/agy/**, package.json/lock, TASKS.md, src/analyst/**,
src/dossier/** except IMPORTING queue/job functions, src/tools/**, src/config/**,
src/rules/**, src/capture/**, src/research/** (import-only), prisma/**, docs/**.
No live network/LLM in vitest. Do NOT commit. NOTE: a live MU dossier process may be
running — do not run the dossier job or restart llama during this batch.

## Gates
`npm run verify` green · `npm run job -- --list` unchanged behavior ·
`npx tsx scripts/scheduler.ts --once` exits 0 against the real DB (read-only decision
pass — it will short-circuit because today's digest exists).

## Wrap-up
Append `## Result`: files, test delta, exact launchd install command for the CEO.
Do NOT commit.

## Result

Wired the scheduler daemon to the real system, sharing one live code path with the job
CLI, plus daily backups and launchd deploy. The dossier job was NOT run and llama was NOT
restarted (the `--once` gate is a read-only decision pass with no side effects).

### Files

New:
- `src/jobs/registry-live.ts` — shared LIVE registry (env + DB open, lazy yahoo2/Stooq/
  EDGAR/HttpProvider wiring, `buildLiveRegistry(db)`, `jobCatalog()`, `drainDossierQueueLive(db)`).
- `src/jobs/registry-live.test.ts` — offline assembly (catalog + bound registry, incl. `backup`).
- `src/jobs/backup.ts` — `runBackupJob` (VACUUM INTO `data/backups/engine-YYYY-MM-DD.db`),
  `pruneBackups` (keep newest 14), `listBackups`, `backupFileName`; never-crash.
- `src/jobs/backup.test.ts` — retention math with temp files + a real VACUUM INTO snapshot.
- `src/schedule/tick.ts` — `evaluateCatchUp` (read-only decision) + `schedulerTick`
  (chain-or-drain, injected fakes).
- `src/schedule/tick.test.ts` — decision + tick behavior against a fixture DB.
- `deploy/install-launchd.sh` — idempotent launchd installer (bootout → copy → bootstrap →
  kickstart → status).

Edited:
- `scripts/scheduler.ts` — real 60s tick loop: morning catch-up runs the `overnight` chain
  (one JobRun/step) then the daily `backup`; idle drains the dossier queue (recoverStale +
  live drain, respects the llama lock); wake detection + heartbeat every 10 ticks + llama
  watchdog; re-entrancy mutex. `--once` = one read-only decision pass, exits 0, NO side effects.
- `scripts/job.ts` — now a thin CLI over `src/jobs/registry-live` (behavior unchanged;
  `--list` still offline).
- `src/db/queries.ts` — `saveDigest` is now an upsert-by-date (delete-by-`d` + insert in a
  txn); cleans up duplicate rows for a date naturally on the next save (no migration).
- `deploy/com.engine.scheduler.plist` — logs to `data/logs/scheduler.log` (+ `.err.log`).
- CLAUDE.md: `scripts/`, `src/jobs/`, `src/schedule/`, `deploy/`.

### Test delta
+12 tests (registry-live 3, backup 7, tick 6 — minus overlap) → suite **342 passing / 53
files** (was 330). Typecheck clean; `✓ CLAUDE.md present in all 49 directories`.

### Gates
- `npm run verify` → green (tsc + 342 tests + CLAUDE.md coverage).
- `npm run job -- --list` → offline, exit 0, unchanged format (+ new `backup` row).
- `npx tsx scripts/scheduler.ts --once` → exit 0, read-only:
  `marketDate=2026-07-03 lastDigest=2026-07-03 shouldCatchUp=false → up to date`.

### CEO launchd install (one command)
```bash
bash deploy/install-launchd.sh
```
(Copies `deploy/com.engine.scheduler.plist` → `~/Library/LaunchAgents/`, bootstraps
`gui/$(id -u)/com.engine.scheduler`, kickstarts it, prints status. Logs: `data/logs/scheduler.log`.
Uninstall: `launchctl bootout gui/$(id -u)/com.engine.scheduler && rm ~/Library/LaunchAgents/com.engine.scheduler.plist`.)

Not committed.
