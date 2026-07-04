# agy batch M3-B.2 — The backtest job (wire the engine, run it live)

The engine core + as-of families exist (src/backtest/engine.ts, families.ts, leak-safe,
tested). This batch wires them into a JOB that runs the grid over ~15y and produces the
per-family/per-horizon results table. Tight, sequential.

## Read first
- `src/backtest/engine.ts` — `forwardReturnPct`, `monthEndGrid`, `scoreSignal`, `mean`.
- `src/backtest/families.ts` — `moversAsOf` (up/down movers), `drawdownFlagsAsOf`,
  and any breadth/eligible-universe helper. Use these AS-IS (they are leak-safe).
- `src/db/queries.ts` — `symbolClosesUpTo` (for start-of-horizon), `activeSymbols`,
  `maxPriceDate`. For FORWARD returns you need bars AFTER asOf — add
  `symbolClosesFrom(db, symbol, fromD)` (`d >= fromD ORDER BY d`) if not present
  (additive). Note: forward reads are NOT lookahead — they measure outcomes.
- `src/jobs/registry-live.ts` + `registry-live.test.ts` (add "backtest" to EXPECTED),
  `src/jobs/backup.ts` for a simple job shape, `src/jobs/universe.test.ts` for the
  test harness pattern.

## Deliverables
1. `src/jobs/backtest.ts` — `runBacktestJob(db, opts?)`:
   - Grid: `monthEndGrid("2010-01-01", <maxPriceDate − 400 days>)` so every as-of has
     ≥12m forward data.
   - Eligible universe at each asOf: active symbols with a bar `d<=asOf` and last close ≥ $5.
   - Baseline per (asOf,horizon): mean `forwardReturnPct` across ALL eligible symbols
     (use `symbolClosesUpTo` + `symbolClosesFrom`, or a combined read, to give
     `forwardReturnPct` the bars spanning asOf→asOf+horizon).
   - For each family (up-movers, down-movers, drawdown-flags) at each asOf: the flagged
     symbols' forward returns; accumulate across ALL as-of points per (family,horizon).
   - Horizons: 21, 63, 126, 252 days (≈1m/3m/6m/12m).
   - Aggregate with `scoreSignal` → per (family,horizon): n, flaggedMean, baselineMean,
     excess, hitRate.
   - Persist JSON to `data/backtests/backtest-<YYYY-MM-DD-HHmmss>.json` (mkdir -p) and
     RETURN a detail string with a compact table. Never throw (catch-per-asOf).
2. Register `backtest` in `src/jobs/registry-live.ts` (+ EXPECTED list in its test).
3. `src/jobs/backtest.test.ts` — a small fixture DB (a few symbols, ~3 years of monthly
   bars engineered so a known signal has a known sign of excess) asserting
   `runBacktestJob` returns non-empty per-family results and the baseline is computed.
   Keep it fast (tiny grid).
4. `src/jobs/CLAUDE.md` note + `data/backtests/CLAUDE.md` (gitignored contents).

## Honesty (put in ## Result)
Report the REAL table. If excess ≈ 0 or negative for a family, say so plainly — a null
result is the finding. Also note the SURVIVORSHIP-BIAS caveat: the universe is today's
listed names, so absolute returns overstate (delisted losers absent); the flagged-vs-
baseline EXCESS is the meaningful number, not the absolute levels.

## Hard constraints
Touch ONLY: src/jobs/backtest.ts, src/jobs/backtest.test.ts, src/jobs/registry-live.ts,
src/jobs/registry-live.test.ts, src/db/queries.ts (additive only), src/jobs/CLAUDE.md,
data/backtests/CLAUDE.md, this spec's ## Result. Do NOT edit engine.ts/families.ts/
synthesize.ts/market-inputs.ts. No `any`. SEQUENTIAL, no subagents. Do NOT commit.

## Gates
`npm run verify` exit 0. `npm run job -- backtest` runs live and prints the table
(this may take a minute over 15y × monthly × universe — that's fine).

## Wrap-up
Append `## Result`: files, test delta, and the FULL live results table (family × horizon:
n, flaggedMean%, baselineMean%, excess%, hitRate) + the one-paragraph honest read.
