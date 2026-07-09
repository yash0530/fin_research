# src/jobs/ — job orchestration

The control-flow that must be correct regardless of what the live fetchers do. Pure over
injected dependencies → fully tested with fakes (no network).

## Files

- `runner.ts`
  - `runJob(name, fn, record?)` — the **jobs-never-crash** wrapper: a thrown error becomes
    `{ok:false, detail}`, never propagates. `record` persists a JobRun row in the app.
  - `runChain(steps, record?)` — runs steps in order; a **failed step never aborts** the
    chain (failures are counted). This is the overnight pipeline shape
    (prices→news→earnings→…→digest).
- `backfill.ts`
  - `runBackfill(deps)` — generic **resumable** (skip `isDone` symbols) + **catch-per-item**
    orchestrator. Live Yahoo/EDGAR fetchers plug into `fetchOne`; persistence into
    `write`/`markDone`/`markError`; `onEach` for rate-limit pauses. Returns
    `{done, errors, skipped, rows}`.
  - `runBackfillPool(deps)` — the same invariants with N workers draining a shared queue
    + an optional per-item stagger (bounded concurrency for throughput while staying polite).
  - Live-wired tasks (fetchers injected, built in `scripts/job.ts`): `backfillPrices10y`
    (bars since today−3660d → Price, chunked 500-row txns, conc 2/1200ms; accepts `force: true` to bypass
    `BackfillProgress` and overwrite existing rows using `upsertPrices`),
    `backfillFundamentals` (quarterly → FundamentalsQuarter), `backfillEdgarIndex`
    (`parseCompanyTickers` → Ticker.cik, then submissions → EdgarFiling). Each records
    BackfillProgress per symbol.
- `stats.ts` — `runStatsJob`: batched yahoo2 quote() over active tickers → Ticker stat
  columns (COALESCE keeps prior values on a transient null). Never-crash, catch-per-item.
- `news.ts` — `runNewsJob`: Google News RSS per query (`googleNewsUrl`) → `parseNewsRss`
  (fast-xml-parser, pure) → NewsItem deduped by `urlHash`. Catch-per-query.
- `earnings.ts` — `runEarningsJob`: yahoo2 earnings dates → `earnings` Catalyst upserts,
  deduped by (kind, symbol, d). Catch-per-item.
- `overnight.ts` — the morning chain `prices-heal → stats → news → earnings → rules →
  digest` as a `runChain` (one JobRun row per step). `runPricesHealJob` (5-day chart
  top-up, conc 6/300ms) and `runDigestJob` are the two overnight-only step builders.
  `runDigestJob` assembles a deterministic `SynthInput` from the DB —
  `buildMarketInputs` (breadth/movers/pulses/divergence/credit/data-health) merged with
  recent `RuleEvent`s, upcoming catalysts (**14-day** window — the old 7d fell short of
  the earnings cluster and silenced the family), and failed-job health — then
  `synthesize` → `saveDigest` (upsert-by-date: one Digest row per market date).
- `backup.ts` — the daily SQLite backup job. `runBackupJob(db, {dir,keep,now})` does
  `VACUUM INTO data/backups/engine-YYYY-MM-DD.db` (a consistent snapshot, safe while the
  DB is live), then `pruneBackups(dir, keep=14)` deletes all but the newest N. Same-day
  re-run overwrites today's file (idempotent). Never throws — a failure returns a detail
  string. `listBackups`/`pruneBackups` are pure over the dir listing (dated filenames
  sort chronologically) so retention is unit-testable with temp files.
- `backtest.ts` — `runBacktestJob`: runs the flagship deterministic backtest over the historical monthly grid (Jan-2010 to maxPriceDate - 400 days). Computes forward returns at 21, 63, 126, 252 days. Saves runs to JSON under `data/backtests/backtest-<YYYY-MM-DD-HHmmss>.json` and outputs a summary table.
- `integrity.ts`
  - `splitSuspects`, `flatRuns`, `gaps` — pure detectors of stock splits, flat runs, and chronological gaps.
  - `runIntegrityJob` — scans Price table history for all active symbols using raw close prices for stock splits, and despiked close prices for flat runs and gaps.
- `portfolio.ts` — `runPortfolioCheck`: scans all positions, loads current price and historical closes (despiked), and latest RecCall, runs `decaySignals`, and returns a summary detail string of critical/warn findings.
- `run-lock.ts` — the **single-run pidfile guard** for on-demand runs (`data/run.lock`).
  `acquireRunLock`/`releaseRunLock`/`readRunLock`/`isRunActive` + `setLockLlamaPid`. Two
  clicks can't double-boot the model; a stale lock (owner pid dead) is taken over and its
  orphaned `llamaPid` reaped (SIGKILL) so a crashed run never leaks RAM. Injectable
  kill/alive → unit-tested with a temp lockfile.
- `registry-live.ts` — the **shared LIVE job registry**, extracted from `scripts/job.ts`
  so the CLI and the scheduler daemon run one code path. Owns the env + DB open
  (`loadDotEnv` / `databaseFile` / `openDb`, mirroring `scripts/seed.ts`), the lazy
  live fetchers/providers (yahoo2 / Stooq / EDGAR / `HttpProvider`), `buildLiveRegistry(db)`
  (the runnable entries with `db` bound in), `jobCatalog()` (name+describe for `--list`
  with NO DB/network — single-sourced with the registry), and `drainDossierQueueLive(db)`
  (the scheduler's idle drain: `recoverStale` → live `runDossierJob`, one at a time,
  respecting the llama single-flight lock). Registered jobs: `prices10y`, `fundamentals`,
  `edgar_index`, `stats`, `news`, `earnings`, `rules`, `digest`, `overnight`,
  `refresh_data` (the data chain minus the model: prices-heal→stats→news→earnings→rules,
  the no-model "Refresh data" button target), `dossier`, `backup`, `integrity_check`,
  `backtest`, `portfolio_check`, `form4`, `events8k`, `holdings_13f` (ingests 13F filings for superinvestors, computes overlaps, and merges Candidate tags), `customer_concentration` (extracts customer concentration disclosures from 10-Ks and marks Candidate/FilingEvents), `screens` (runs GICS sector-specific quality screens, including bank-quality and reit-quality). Importing it stays offline; only each `run` touches the wire.

## Tests

`backfill.test.ts` — job success/failure capture, chain-continues-after-failure,
backfill catch-per-item (one symbol times out, the rest complete), and resumability
(a done symbol is never re-fetched).
`backfill-tasks.test.ts` — the live-wired tasks against a real migrated DB with mocked
fetchers: `runBackfillPool` resumability+catch-per-item under concurrency, prices/
fundamentals/edgar writes + BackfillProgress, `parseCompanyTickers`, and the period1
window math.
`jobs.test.ts` — stats (COALESCE, never-crash), news (RSS parse, dedupe, catch-per-query),
earnings (upsert dedupe), the overnight order + failure-resilience + one-JobRun-per-step,
`runPricesHealJob` / `runDigestJob`, and the catalyst-window regression (a near-term
earnings cluster the old 7-day window missed now surfaces).
`registry-live.test.ts` — the live-registry ASSEMBLY offline: `jobCatalog()` lists every
  job (incl. `backup`) with a describe and no DB; `buildLiveRegistry(db)` binds the db in,
  preserves names/order, and is single-sourced with the catalog. Also tests the `events8k` job including guidance changes and spinoff detection, and the `customer_concentration` job for 10-K text extraction and Candidate/FilingEvent persistence.
`backup.test.ts` — retention (`listBackups` filters+sorts dated files, `pruneBackups`
keeps the newest N and deletes the oldest, no-op under the limit) with temp files, and
`runBackupJob` (VACUUM INTO writes a real SQLite backup; same-day re-run overwrites).
`integrity.test.ts` — unit tests for stock splits, flat runs, gaps, and testing `runIntegrityJob` using a migrated in-memory DB.
`portfolio.test.ts` — unit tests for the `runPortfolioCheck` job over a fixture DB.
