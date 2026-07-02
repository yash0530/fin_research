# src/buylist/ — monthly buy-list allocation

Turns recent BUY verdicts into a ranked, sized plan for the month's capital. **No
broker/execution** — the user logs actual buys against this plan.

## build.ts

`buildBuyList(candidates, { capitalUsd, minLotUsd, maxAgeDays })`:
- Eligible = `action === "BUY"` AND `ageDays <= maxAgeDays`.
- Rank by conviction (HIGH→MEDIUM→LOW), then confidence, then effective size.
- Effective size = `min(judgeSizePct, governedSizePct)` (the governor already capped it).
- Allocate `capital × size%`; if total > 100% scale proportionally; floor each to
  `minLotUsd`; items below a lot are `skipped` (plannedUsd 0).
- Residual (`capital − deployed`) is the cash line.

## Tests

`build.test.ts` — ranking, min(judge,governed) sizing, sub-lot skip, age exclusion,
residual cash, proportional scaling when sizes exceed 100%.
