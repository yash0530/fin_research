# src/screens/ — individual stock screen modules

Pure modules evaluating individual tickers over historical quarterly fundamentals.

## Modules

- `fscore.ts` — Piotroski 9-test profitability, leverage, and efficiency score comparing current TTM (last 4 quarters) vs prior TTM (quarters 5-8).
- `bank-quality.ts` — quality screen for GICS Financials (`g_financials`). Over the freshest 4 complete quarters, tests ROA, ROE, capital ratio, and efficiency proxy.
- `reit-quality.ts` — quality screen for GICS Real Estate (`g_real_estate`). Over the freshest 4 complete quarters, computes FFO TTM, FFO per share, and cheapness based on P/FFO.
- `accruals.ts` — Sloan accruals calculated as `(TTM Net Income - TTM CFO) / average Total Assets` over the TTM quarters.
- `dilution.ts` — 3-year (12-quarter) net share count change percentage.
- `cohort.ts` — Sector-relative cohort cheapness based on EV/EBIT (selects the bottom 25% within each sector).
- `earnings-trend.ts` — Seasonal-naive earnings trend z-score calculated over the latest EPS vs expected EPS and historical errors.
- `insider-cluster.ts` — Evaluates market-cap-scaled insider purchase clusters over a rolling 30-day window, excluding 10b5-1 plans and passive 10% owners.
- `eightk-classify.ts` — Classifies reported 8-K items and detects earnings guidance direction (up/down) using regex.
- `spinoff-detect.ts` — Detects spin-off announcements and completions from 8-K filings using regex/keywords.
- `superinvestor-overlap.ts` — Evaluates stocks owned by tracked superinvestors based on CUSIP mapping, returning holders, count, and whether the position is new this quarter.
- `merge-quarters.ts` — `mergeQuarters(quarters)`: collapse near-duplicate quarters (Yahoo calendar month-end vs EDGAR fiscal close, period-end within 10 days) into one **field-wise-complete** row each (first non-null per field, prefer later date), sorted oldest→newest. Un-merged, the two sources fragment fields across sibling rows (cfo on one, balance-sheet instants on the other) and every screen collapses. **Every screens read path applies this first** (screens job, research runner, ticker + themes readers).
- `ev.ts` — `computeEvToEbit(quarters, marketCap)`: EV/EBIT on the **freshest available** TTM EBIT window (the last 4 quarters that carry `operatingIncome`, not a strict last-4 that a single missing recent quarter starves), refusing windows staler than 540 days and suspending the multiple on non-positive EBIT. Debt/cash fall back to the newest quarter that has them. Returns `{evToEbit, staleWindow, warnings}`. Single source for the cohort screen, the research runner, and the themes reader.
- `types.ts` — Shared database-equivalent TypeScript interfaces (e.g. `FundamentalsQuarter`).

## Design Patterns

- **No DB/Network:** All modules are pure and operate on injected data arrays.
- **Freshest-complete window (not literal last-N):** TTM/multi-quarter screens (fscore, accruals, dilution) build their trailing window from `quartersWith(...)` — the freshest quarters that actually report the required fields — NOT a raw `slice(-4)`. The newest calendar quarter routinely predates its own 10-Q cash-flow/share-count filing, so a strict last-N window is voided by one un-filed statement even when years of complete history exist. On live data this took the funnel from ~3% computable to a working screen. `ev.ts` uses the same principle for EV/EBIT.
- **Null Handling:** Null or missing metrics result in an `unknown` verdict/result and append a descriptive warning string to the warnings array. A quarter with null `netIncome` (a non-reporting fiscal-Q4 stub, balance-sheet only) is dropped by `mergeQuarters` before screens run.
- **Sector Exclusions:** All quality screens (F-Score, accruals, dilution, cohort, earnings trend) exclude financial and REIT GICS sectors (`g_financials`, `g_real_estate`) using `screenApplicability(sectorCodes)`.

## Tests

Every module has a co-located `*.test.ts` file covering:
- Happy paths (valid inputs)
- Sector applicability checks
- Graceful null-metric warnings
- Insufficient quarter count edge cases
