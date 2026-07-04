# src/backtest/ — deterministic backtest harness

The flagship deterministic backtest engine and signal families. Every component is lookahead-free: price reads are windowed strictly to `d <= asOf`.

## Files

- `engine.ts`
  - `forwardReturnPct(closes, fromD, horizonDays)` — pure math computing return snapping to nearest-on-or-after date. Despikes price series first.
  - `monthEnds(startISO, endISO)` — generates approximate calendar month-end dates.
  - `scoreSignal(flagged, baseline, fwdReturns)` — computes portfolio metrics: flagged names mean returns, baseline mean returns, excess returns, and the hit rate.
- `families.ts`
  - `moversAsOf(db, asOf, n=10)` — top 1-day absolute percentage movers as of `asOf` (price >= $5, active, non-benchmarks). Split into `up` and `down` movers.
  - `drawdownFlagsAsOf(db, asOf, pct=25, lookback=252)` — active symbols down >= `pct` from their trailing `lookback` peak as of `asOf` (price >= $5).
  - `breadthAsOf(db, asOf)` — % of eligible active symbols above their 50-bar moving average as of `asOf`.
  - `latestTradingDayUpTo(db, asOf)` — resolves the latest trading day in the database on or before the given `asOf` date.

## Tests

- `backtest.test.ts`
  - `forwardReturnPct` unit tests with a known series and edge cases.
  - `monthEnds` calendar grid generation verification.
  - `scoreSignal` metric scoring verification.
  - **Lookahead Leak Tests** — asserts that `moversAsOf`, `drawdownFlagsAsOf`, `breadthAsOf`, and `closesBetween` NEVER read or use future data (i.e. bars with `d > asOf`), proven via a fixture DB containing simulated future price spikes/drops.
