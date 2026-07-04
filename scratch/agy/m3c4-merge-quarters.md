# agy batch M3-C.4 — Merge (not select) near-duplicate quarters — the finish-line fix

## Why (CEO diagnosis, verified on real MU data)
The C.3 `dedupFundamentals` SELECTS one row per near-duplicate cluster, but the two
near-duplicate rows are COMPLEMENTARY, not redundant: the EDGAR row (periodEnd
2026-05-31) carries some fields; the sibling row (2026-05-28) carries the balance-
sheet instants (currentAssets/currentLiabilities/retainedEarnings) the EDGAR row lacks.
Selecting one throws away the other's fields → Altman Z (which needs those instants)
can't compute → the tool returns "missing" on major large-caps. The fix: MERGE the
cluster field-by-field so the combined quarter is complete. (Altman needs no CFO, so a
merged row computes it even when quarterly CFO is sparse — the honest partial outcome.)

## Deliverable (ONE focused change + test + re-demo)
1. `src/tools/factory.ts`: replace the select-one logic in `dedupFundamentals` with a
   FIELD-WISE MERGE. For each cluster of rows whose `periodEnd` values are within 10
   days of each other:
   - Produce ONE merged `FundRow`. `periodEnd` = the latest in the cluster.
   - For EVERY numeric field (revenue, grossProfit, operatingIncome, netIncome, fcf,
     capex, totalAssets, totalDebt, cash, equity, sharesOut, cfo, sga, depreciation,
     receivables, currentAssets, currentLiabilities, retainedEarnings, ppe): take the
     first NON-NULL value across the cluster (prefer the later/EDGAR row when both are
     non-null — they should agree; ties don't matter).
   - Keep the result sorted oldest→newest, one row per quarter.
   Do NOT change the QoE tool logic, the sanity guards, or the honest-partial behavior —
   only the dedup→merge helper. The now-complete rows will let altmanZ (and accrual when
   CFO present) compute correctly through the EXISTING C.3 code paths.
2. Update the C.3 dedup test: rename/adjust to assert MERGE semantics — two rows 3 days
   apart, each with DIFFERENT non-null fields (e.g. row A has currentAssets, row B has
   cfo) → the merged row has BOTH. Keep all other tests green.

## Expected outcome (state it, don't fake it)
After this, `qoe` on a large-cap like MU should return `data_status: "partial"` (or
"ok") with a NON-NULL `altmanZ` + zone, accrual either computed (if TTM CFO clean) or
honestly omitted — NEVER "missing" when the balance sheet is present. The CEO will
re-run the live demo to confirm; report your test-fixture result in ## Result.

## Hard constraints
Touch ONLY: src/tools/factory.ts, src/tools/factory.test.ts, this spec's ## Result. Do
NOT edit qoe.ts/edgar-facts.ts/queries.ts. No `any`. No re-backfill needed (merge is at
read time). SEQUENTIAL, no subagents. Do NOT commit.

## Gate
`npm run verify` exit 0.

## Wrap-up
Append `## Result`: the merge change, the updated test, and confirmation verify is green.

## Result

- **Implementation**: Replaced row selection in `dedupFundamentals` (located in [factory.ts](file:///Users/yash/Desktop/Programming/fin_research/src/tools/factory.ts)) with a field-wise merge. The merge groups clusters of rows within 10 days of each other, sorting descending by `periodEnd` to select the first non-null value for every numeric field (preferring later/EDGAR on ties) and setting `periodEnd` to the latest date.
- **Updated Test**: Adjusted the test suite in [factory.test.ts](file:///Users/yash/Desktop/Programming/fin_research/src/tools/factory.test.ts) to verify field-wise merge semantics: row A has `currentAssets`, row B has `cfo` and a tied `revenue` field → the merged row correctly possesses both fields, takes the later row's value for the tie, and has the latest `periodEnd` date.
- **Verification**: Executed `npm run verify` successfully with exit code 0 (all 414 tests passing).
