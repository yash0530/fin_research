# src/screens/ — individual stock screen modules

Pure modules evaluating individual tickers over historical quarterly fundamentals.

## Modules

- `fscore.ts` — Piotroski 9-test profitability, leverage, and efficiency score comparing current TTM (last 4 quarters) vs prior TTM (quarters 5-8).
- `accruals.ts` — Sloan accruals calculated as `(TTM Net Income - TTM CFO) / average Total Assets` over the TTM quarters.
- `dilution.ts` — 3-year (12-quarter) net share count change percentage.
- `cohort.ts` — Sector-relative cohort cheapness based on EV/EBIT (selects the bottom 25% within each sector).
- `earnings-trend.ts` — Seasonal-naive earnings trend z-score calculated over the latest EPS vs expected EPS and historical errors.
- `types.ts` — Shared database-equivalent TypeScript interfaces (e.g. `FundamentalsQuarter`).

## Design Patterns

- **No DB/Network:** All modules are pure and operate on injected data arrays.
- **Null Handling:** Null or missing metrics result in an `unknown` verdict/result and append a descriptive warning string to the warnings array.
- **Sector Exclusions:** All quality screens (F-Score, accruals, dilution, cohort, earnings trend) exclude financial and REIT GICS sectors (`g_financials`, `g_real_estate`) using `screenApplicability(sectorCodes)`.

## Tests

Every module has a co-located `*.test.ts` file covering:
- Happy paths (valid inputs)
- Sector applicability checks
- Graceful null-metric warnings
- Insufficient quarter count edge cases
