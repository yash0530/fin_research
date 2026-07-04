# agy batch M3-C.3 — QoE correctness: dedup + capex sign + honest partial (NO wrong numbers)

## Why (CEO diagnosis)
C.2 wired canonical QoE but it emits a WRONG accrual (MU 0.56; should be ±0.1) and
rarely reaches canonical. Root causes found:
1. **Duplicate quarters**: Yahoo (periodEnd = last trading day, e.g. 2026-05-28) and
   EDGAR (fiscal quarter end, 2026-05-31) rows coexist (PK is symbol+periodEnd). The
   Yahoo dup has NULL deep fields → pollutes aggregation + blocks canBuildCanonical.
2. **capex sign inconsistent** (8572 positive vs 539 negative) → the `fcf+capex` CFO
   reconstruction is wrong on the negatives.
3. **CFO is sparse** (cash-flow items are YTD-cumulative in interims → clean single-
   quarter CFO only in fiscal-Q1), so full canonical rarely has 4 clean quarters.

## Guiding principle (NON-NEGOTIABLE)
**A wrong forensic number is worse than an honest "partial".** The tool must NEVER emit
a score it can't compute correctly. When inputs are corrupt/incomplete → honest partial,
not a guess. Altman Z, however, needs NONE of the cash-flow items — compute it whenever
its inputs are present.

## Read first
- `src/tools/factory.ts` — `loadFundamentals`, the C.2 `qoe` tool + `buildAnnualPeriod`
  + `canBuildCanonical` + `calculateAccrualRatioFromAvailable` (the 0.56 bug lives here).
- `src/tools/qoe.ts` — `AnnualPeriod`, `altmanZ(p)` (needs revenue, ebit, totalAssets,
  currentAssets/Liabilities via workingCapital, retainedEarnings, equity/MVE,
  totalLiabilities — NO cfo/sga/depreciation), `accrualRatio(p)` (needs netIncome, cfo,
  totalAssets), `piotroskiF`, `beneishM`. REUSE these; don't reimplement.
- `src/net/edgar-facts.ts` — `quarterlyFlow`; the capex extraction (FLOW_CONCEPTS.capex).

## Deliverables
1. **Capex sign fix** (`src/net/edgar-facts.ts`): normalize capex to a consistent
   POSITIVE spend — `Math.abs()` on the parsed capex value so `cfo = fcf + capex` is
   always valid. (Capex is a cash outflow; store magnitude.) Update the edgar-facts
   test to assert positive capex.
2. **Dedup near-duplicate quarters** (`src/tools/factory.ts` `loadFundamentals`, or a
   helper it calls): collapse rows whose `periodEnd` is within 10 days of another to ONE
   row per quarter, keeping the row with the MOST non-null deep fields (cfo/sga/
   depreciation/receivables/currentAssets/currentLiabilities/retainedEarnings/ppe). Pure
   + unit-tested (two rows 3 days apart, one deep one shallow → the deep one kept).
3. **QoE tool honesty rewrite** (`src/tools/factory.ts`):
   - After dedup, take trailing quarters. Build a TTM `AnnualPeriod` (flows summed over
     the 4 most-recent CLEAN consecutive quarters; instants from the last; cfo from
     stored `cfo` else `fcf+capex` now that capex is positive; totalLiabilities =
     totalAssets − equity).
   - **Always compute `altmanZ`** when its inputs (revenue, ebit, totalAssets, working-
     capital fields, retainedEarnings, equity, totalLiabilities) are present — it does
     NOT need cfo. Report altmanZ + zone.
   - Compute `accrualRatio` ONLY when cfo (or a valid fcf+capex) is present for the TTM;
     **sanity-guard**: if |accrualRatio| > 1, treat as data error → omit it (don't emit).
   - Compute `beneishM`/`piotroskiF` only when BOTH current and prior TTM periods are
     fully clean (all their inputs non-null); else omit those two.
   - `data_status`: "ok" only if altmanZ AND accrualRatio both emitted cleanly;
     "partial" if some (e.g. only altmanZ); "missing" if none. `confidence`: "high" when
     ok, "medium" when partial-with-altman, "low" otherwise. Include a `computed` array
     naming which scores were produced and an `omitted` array naming which were skipped
     and why (e.g. "beneishM: prior-period inputs incomplete").
   - NEVER emit the old blanket "FCF proxy" note when real inputs were used.
4. **Eval test** (`src/tools/factory.test.ts` or qoe-canonical.test.ts): (a) a fixture
   with clean deep data for 8 consecutive quarters → canonical (altmanZ + accrual
   non-null, data_status ok, no insane values); (b) a fixture with sparse cfo but full
   balance sheet → altmanZ emitted, accrual omitted, data_status "partial" (honest);
   (c) a fixture that would yield |accrual|>1 → accrual omitted (sanity guard).

## Hard constraints
Touch ONLY: src/net/edgar-facts.ts, src/net/edgar-facts.test.ts, src/tools/factory.ts,
src/tools/factory.test.ts (+/or a new qoe-canonical.test.ts), this spec's ## Result. Do
NOT edit src/tools/qoe.ts. No `any`. SEQUENTIAL, no subagents. Do NOT commit. Do NOT run
the live re-backfill (CEO does it — the capex fix needs a re-backfill).

## Gates
`npm run verify` exit 0. The eval proves: clean→canonical, sparse→honest-partial-with-
Altman, insane→omitted. No wrong numbers anywhere.

## Wrap-up
Append `## Result`: files, test delta, and confirm the three eval cases pass. Note the
CEO must reset edgar_facts BackfillProgress + re-run (capex sign changed).
