# agy batch M3-C.2 — Canonical QoE tool (reuse tested math) + re-backfill upsert + eval

## Why
FundamentalsQuarter now carries the canonical inputs (C.1). This batch (a) makes the
re-backfill FILL those fields on existing rows, and (b) upgrades the QoE tool to compute
REAL Beneish/Altman/Piotroski by feeding the deep data into the ALREADY-TESTED pure
module `src/tools/qoe.ts` — do NOT reimplement any forensic formula.

## Read first (critical — reuse, don't reinvent)
- `src/tools/qoe.ts` — `AnnualPeriod` type + `qoeReport(current, prior)` +
  `accrualRatio/altmanZ/piotroskiF/beneishM`. These are golden-tested. You BUILD their
  inputs and CALL them. Never rewrite the formulas.
- `src/tools/factory.ts` — the current `qoe` tool (~line 314, the FCF-proxy version you
  replace), `loadFundamentals(db, symbol)` (~line 114 — note: extend its SELECT to
  include the 8 new columns), the `out()/missing()` result helpers, `DataStatus`.
- `src/db/queries.ts` — `insertFundamentals` + the `FundamentalsQuarterRow` (now has the
  8 new fields). `upsertPrices` (~the ON CONFLICT DO UPDATE pattern to mirror).
- `src/jobs/backfill.ts` — `backfillEdgarFacts` (uses insertFundamentals via `write`).
- `src/tools/qoe.test.ts` — how AnnualPeriod fixtures are shaped (for your eval test).

## Deliverables
1. `src/db/queries.ts`: NEW `upsertFundamentals(db, rows)` = INSERT ... ON CONFLICT
   (symbol,periodEnd) DO UPDATE SET **every** column = excluded.column (EDGAR is the
   authoritative source; overwriting its own rows is correct). Chunked txns like
   insertFundamentals. Do NOT change insertFundamentals.
2. `src/jobs/backfill.ts`: `backfillEdgarFacts` writes via `upsertFundamentals` (so a
   re-run fills the new deep columns on existing EDGAR rows). Yahoo-only rows (no EDGAR
   overlap) are untouched. Add/adjust its test.
3. `src/tools/factory.ts`:
   - Extend `loadFundamentals` SELECT to include cfo, sga, depreciation, receivables,
     currentAssets, currentLiabilities, retainedEarnings, ppe (+ existing fields).
   - REPLACE the `qoe` tool: build two `AnnualPeriod`s from the deep quarters —
     the latest 4 consecutive quarters = current FY, the prior 4 = prior FY.
     FLOWS (revenue, grossProfit, sga, depreciation, ebit=operatingIncome, netIncome,
     cfo) = SUM of the 4 quarters. INSTANTS (receivables, currentAssets, ppe,
     totalAssets, currentLiabilities, retainedEarnings, sharesOut) = the LAST quarter
     of that FY. Derive: `longTermDebt` = totalDebt (latest); `totalLiabilities` =
     totalAssets − equity; `cfo` fallback = fcf + capex when cfo null. Leave `sbc`/
     `marketValueEquity` undefined (qoe.ts falls back).
   - If both FYs have ≥4 quarters and the core fields are non-null: call
     `qoeReport(current, prior)`, return its scores (beneishM/altmanZ/piotroskiF/
     accrualRatio + zones/flags), `confidence: "high"`, `data_status: "ok"`.
   - Graceful degrade: if a FY is incomplete, keep a partial result (the accrual ratio
     from whatever's available) with `data_status: "partial"` — but NO MORE the blanket
     "FCF proxy / inputs absent from local schema" note when inputs ARE present.
4. Eval test `src/tools/qoe-canonical.test.ts` (or extend factory's test): a temp
   migrated DB seeded with 8 quarters of deep fundamentals for one symbol → run the
   `qoe` tool → assert it returns non-null canonical scores + data_status "ok" +
   confidence "high" (NOT the proxy note). This is the regression guard.

## Hard constraints
Touch ONLY: src/db/queries.ts, src/db/queries.test.ts, src/jobs/backfill.ts,
src/jobs/backfill.test.ts (or backfill-tasks.test.ts), src/tools/factory.ts,
src/tools/factory.test.ts (or a new qoe-canonical.test.ts), and this spec's ## Result.
Do NOT edit src/tools/qoe.ts (reuse it). No `any`. SEQUENTIAL writes, no subagents. Do
NOT commit. Do NOT run the live re-backfill (CEO does it).

## Gates
`npm run verify` exit 0. The eval test proves canonical (not proxy) output.

## Wrap-up
Append `## Result`: files, test delta, and confirm the eval asserts canonical QoE. Note
the CEO re-backfill command (`npm run job -- edgar_facts`, now upserting).
