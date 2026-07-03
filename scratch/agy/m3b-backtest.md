# agy batch M3-B — Deterministic signal backtest (the flagship)

## Goal
Answer, over ~15-20y of clean adjusted-close history, the only question that matters:
**do our deterministic signals actually precede returns?** Replay the symbol-level
signal families as-of historical month-ends and score their forward returns vs an
equal-weight baseline. Cheap (no LLM). Honest — report null/negative results plainly.

## ⚠ THE ONE PROPERTY THAT MUST BE PERFECT: NO LOOKAHEAD
`buildMarketInputs(db, asOf)` in `src/research/market-inputs.ts` anchors to
`maxPriceDate(db)` (the LATEST bar) and `closesSince(db, sinceD)` has NO upper date
bound. So it ALWAYS sees the newest data — replaying "as of 2015" would illegally read
2026 prices. The backtest is worthless if any read sees data with `d > asOf`. Every
price read in the backtest path MUST be windowed to `d <= asOf`. This is the entire
correctness battle — build it leak-free and prove it with a test.

## Read first
- `src/research/market-inputs.ts` — `buildMarketInputs`, its price reads
  (`maxPriceDate`, `latestBarDates`, `closesSince`), `MarketInputs` shape.
- `src/research/synthesize.ts` — `synthesize(input)`, the `SynthInput` families,
  `Insight` shape. (You will NOT re-run synthesize necessarily — see scope.)
- `src/db/queries.ts` — `closesSince` (d>=sinceD, NO upper bound), `activeSymbols`,
  `loadCloses`. Add as-of read helpers here (additive).
- `src/lib/metrics.ts` — `despike`. Use for all return math.
- `src/jobs/*.test.ts` — the migrated-`:memory:`-DB test pattern (createRequire node:sqlite).

## Deliverables
1. `src/db/queries.ts`: NEW `closesBetween(db, sinceD, asOf)` = `d BETWEEN ? AND ?`
   (the bounded version of closesSince) and `symbolClosesUpTo(db, symbol, asOf, limit?)`
   (a symbol's closes with `d <= asOf`, oldest→newest). Additive; no change to existing.
2. NEW `src/backtest/engine.ts` — pure, fully unit-tested:
   - `forwardReturnPct(closes: {d,close}[], fromD, horizonDays)`: return from the
     close on/nearest-before fromD to the close nearest fromD+horizonDays. null if
     insufficient data. Despike inputs.
   - `monthEnds(startISO, endISO)`: the as-of grid (last trading-ish date per month
     — approximate with calendar month-ends; the return fn snaps to nearest bar).
   - `scoreSignal(flagged: string[], baseline: string[], fwdReturns: Map<string,number>)`:
     returns `{ n, flaggedMeanPct, baselineMeanPct, excessPct, hitRate }` where hitRate
     = fraction of flagged names beating the baseline mean.
3. NEW `src/backtest/families.ts` — as-of signal extractors (NO lookahead; each takes
   `db` + `asOf` and reads only `d <= asOf`):
   - `moversAsOf(db, asOf, n=10)`: top |1-day %| movers as of asOf (price ≥ $5 filter
     to exclude microcap noise). Split into up-movers and down-movers (test momentum
     vs mean-reversion separately).
   - `drawdownFlagsAsOf(db, asOf, pct=25, lookback=252)`: symbols ≥ pct off their
     trailing-252-bar high as of asOf (the tripwire family's core signal).
   - `breadthAsOf(db, asOf)`: % of eligible symbols above their 50-bar MA as of asOf
     (a market regime scalar, scored against forward MARKET/baseline return).
4. NEW `src/jobs/backtest.ts` + `backtest` job: over the as-of grid (default monthly,
   Jan-2010→18-months-before-max so every point has ≥12m forward data), for each
   symbol-level family compute forward 1m/3m/6m/12m returns of flagged names vs the
   equal-weight eligible-universe baseline; aggregate per family+horizon. Persist a
   `BacktestRun` — but PRISMA IS FROZEN THIS BATCH, so persist to a JSON file under
   `data/backtests/<timestamp>.json` (mkdir if needed) AND print a summary table.
   Register in registry-live + EXPECTED test list.
5. Tests: forwardReturnPct (known series), scoreSignal (flagged-beats/loses-baseline),
   **a LOOKAHEAD-LEAK test**: build a fixture DB with a bar at asOf+1 that would change
   the answer, and assert the as-of extractors + closesBetween never read it.
6. CLAUDE.md: new `src/backtest/CLAUDE.md` + a src/jobs note.

## Scope discipline / honesty
- Symbol-level families only this batch (movers, drawdown; breadth as a regime scalar).
  Sector-level divergence/credit are follow-on.
- Report results HONESTLY in ## Result — if a signal has no edge (excess ≈ 0 or
  negative), say so plainly. A null result is a real finding, not a failure.
- Equal-weight baseline = mean forward return of all eligible (price≥$5) symbols with
  data at that asOf. Excess = flagged mean − baseline mean.

## Hard constraints
Do NOT touch: web/**, prisma/**, src/analyst/**, src/dossier/**, src/config/**,
src/capture/**, src/story/**, scripts/scheduler.ts, docs/**, package.json.
`src/research/synthesize.ts` + `market-inputs.ts` are READ-ONLY references (do not edit;
build the as-of path fresh in src/backtest to keep the leak-free logic isolated and
testable). Additive; no `any`. SEQUENTIAL writes, no subagents. Do NOT commit.

## Gates
`npm run verify` exit 0. `npm run job -- backtest` runs live against the real DB and
prints the per-family/per-horizon table (report the ACTUAL numbers in ## Result).

## Wrap-up
Append `## Result`: files, test delta, and CRUCIALLY the live backtest table — for each
family × horizon: n, flagged mean %, baseline mean %, excess %, hit-rate. Plus a
one-paragraph honest read: which signals (if any) showed forward edge, which didn't.
