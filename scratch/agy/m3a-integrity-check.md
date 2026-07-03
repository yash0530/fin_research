# agy batch M3-A — Price-data integrity audit (engine + job)

## Why
The 20y Price series feeds every technical, the story-page charts, and (next batch)
a backtest. `src/net/yahoo2.ts` maps `quote.close` (RAW close, not adjusted) — so an
unadjusted stock split would appear as a ~50-90% one-day gap and poison everything.
Before we backtest, we must PROVE the series is clean (or find what isn't). Read-only
detection this batch; no data mutation.

## Read first (contracts to reuse — do NOT reinvent)
- `src/lib/metrics.ts` — `despike` (rolling-median). Reuse; do not re-implement.
- `src/db/queries.ts` — `activeSymbols`, `latestBarDates`, `closesSince`, `maxPriceDate`,
  the Price row shape. Add new read helpers here if needed (additive only).
- `src/jobs/registry-live.ts` — how a job is registered (name/describe/run) + `jobCatalog`
  + its test `registry-live.test.ts` (you MUST add the new job name to the EXPECTED list).
- `src/jobs/*.test.ts` — the migrated-`:memory:`-DB + `createRequire("node:sqlite")` test
  pattern. Match it exactly (vite-safe import).

## Deliverables
1. NEW `src/jobs/integrity.ts` — pure detectors over a symbol's chronological closes
   (plain `number[]` / `{d,close}[]` in, findings out — NO DB inside the pure fns):
   - `splitSuspects(bars)`: adjacent-day ratio `close[i]/close[i-1]` outside
     [0.55, 1.8] (a ≈2:1 split down = 0.5, a reverse split up) AND not recovered next
     day → likely an unadjusted split. Return the date + ratio + a guessed split factor
     (nearest simple ratio: 2,3,4,5,7,10,1/2,…).
   - `flatRuns(bars, minLen=15)`: runs of ≥minLen identical closes (dead/halted data).
   - `gaps(bars, maxGapDays=10)`: calendar gaps between consecutive bars beyond
     maxGapDays that aren't just weekends/holidays (coverage holes).
   Each returns typed findings; all pure + unit-tested with fixtures (a clean series,
   a 2:1-split series, a flat run, a gap).
2. NEW `src/jobs/integrity.test.ts` — fixtures per detector (clean → no findings;
   injected split → one split suspect with factor≈2; flat run detected; gap detected).
3. NEW `integrity_check` job in `src/jobs/registry-live.ts` (+ EXPECTED list in the
   test): scan every active symbol's full history (despiked read is fine for flat/gap;
   split detection must run on RAW closes — read Price directly, do NOT despike before
   split detection, since despike could mask a split). Output a summary detail string:
   `N symbols, S split-suspects across K symbols, F flat-runs, G gaps` and log the worst
   offenders (symbol + date + factor). Never mutates data. Never throws (catch-per-item).
4. NEW `src/jobs/CLAUDE.md` entry (append to the existing file) documenting integrity.ts.

## Hard constraints
- Do NOT touch: web/**, scratch/**(except this file's ## Result), package.json,
  prisma/**, src/analyst/**, src/dossier/**, src/config/**, src/capture/**,
  src/research/**, src/story/**, docs/**, other scripts.
- Additive only. No data mutation this batch (detection only). No `any`.
- SEQUENTIAL writes, no subagents. Do NOT commit.

## Gates (fix until BOTH green)
- `npm run verify` (tsc + vitest + CLAUDE.md coverage) exit 0.
- `npm run job -- integrity_check` runs against the real DB and prints a summary
  (this is live; report the actual numbers in ## Result).

## Wrap-up
Append `## Result`: files, test delta, and CRUCIALLY the live integrity numbers —
how many split-suspects/flat-runs/gaps, and the worst offenders. This finding decides
whether M3-B (backtest) proceeds or whether we fix data first.

## Result

- **Files Created/Modified**:
  - `src/jobs/integrity.ts` (new)
  - `src/jobs/integrity.test.ts` (new)
  - `src/jobs/registry-live.ts` (modified)
  - `src/jobs/registry-live.test.ts` (modified)
  - `src/jobs/CLAUDE.md` (modified)
  - `scratch/agy/m3a-integrity-check.md` (modified)

- **Test Delta**:
  - Added unit and integration tests in `src/jobs/integrity.test.ts` covering split detection, flat runs, gap detection, and `runIntegrityJob`.
  - Added `integrity_check` to the registry catalog tests in `src/jobs/registry-live.test.ts`.
  - All 385 tests in the suite are green.

- **Live Integrity Numbers**:
  - **Symbols Scanned**: 557
  - **Split Suspects**: 28 suspects across 15 distinct symbols
  - **Flat Runs**: 18 flat runs
  - **Gaps**: 0 gaps

- **Worst Split Offenders**:
  1. **KDP**: 2018-07-10, ratio = 0.1794, factor = 5
  2. **SERV**: 2024-03-11, ratio = 0.2235, factor = 5
  3. **RCAT**: 2019-08-02, ratio = 0.2459, factor = 4
  4. **EH**: 2021-02-16, ratio = 0.3731, factor = 3
  5. **RCAT**: 2017-12-15, ratio = 3.3333, factor = 0.3333
  6. **RCAT**: 2018-01-04, ratio = 2.9000, factor = 0.3333
  7. **RCAT**: 2019-08-01, ratio = 2.5417, factor = 0.3333
  8. **SERV**: 2024-07-19, ratio = 2.8707, factor = 0.3333
  9. **APA**: 2020-03-09, ratio = 0.4614, factor = 2
  10. **APLD**: 2022-06-13, ratio = 0.4745, factor = 2
