# agy batch M3-C.1 — Deepen FundamentalsQuarter for canonical QoE (schema + parser)

## Why
The QoE forensics tool degrades to an FCF proxy because FundamentalsQuarter lacks the
canonical inputs — but they're all in the EDGAR companyfacts we already fetch, just not
stored. This batch STORES them. (The QoE tool upgrade is the next batch; this one only
widens the data.) All 9 concepts verified present in real companyfacts.

## Read first (exact patterns — match them)
- `src/net/edgar-facts.ts` — `parseCompanyFacts`, the `quarterlyFlow()` (single-quarter
  flows) and `instant()` (point-in-time) helpers, `firstConcept()`, `FLOW_CONCEPTS` /
  `INSTANT_CONCEPTS` maps, and the row assembly. You extend these.
- `src/net/edgar-facts.test.ts` — the fixture-based test; extend it for the new fields.
- `prisma/migrations/0002_rule_event.sql` and `0004_story_page.sql` — the additive-
  migration pattern (ALTER TABLE ADD COLUMN). Follow it.
- `src/db/queries.ts` — `FundamentalsQuarterRow` type + `insertFundamentals` (the
  INSERT column list). Add the new columns there.

## Deliverables
1. NEW `prisma/migrations/0006_fundamentals_qoe_fields.sql` — additive `ALTER TABLE
   "FundamentalsQuarter" ADD COLUMN` for each (all REAL, nullable):
   `cfo`, `sga`, `depreciation`, `receivables`, `currentAssets`, `currentLiabilities`,
   `retainedEarnings`, `ppe`.
2. `prisma/schema.prisma` — add the same 8 optional Float fields to the
   `FundamentalsQuarter` model (keep it in sync with the migration).
3. `src/net/edgar-facts.ts` — extend the concept maps + row assembly:
   - FLOW concepts (use `quarterlyFlow`): `cfo` →
     `NetCashProvidedByUsedInOperatingActivities` (fallback
     `NetCashProvidedByUsedInOperatingActivitiesContinuingOperations`);
     `sga` → `SellingGeneralAndAdministrativeExpense`;
     `depreciation` → `DepreciationDepletionAndAmortization` (fallback
     `DepreciationAmortizationAndAccretionNet`).
   - INSTANT concepts (use `instant`): `receivables` → `AccountsReceivableNetCurrent`;
     `currentAssets` → `AssetsCurrent`; `currentLiabilities` → `LiabilitiesCurrent`;
     `retainedEarnings` → `RetainedEarningsAccumulatedDeficit`;
     `ppe` → `PropertyPlantAndEquipmentNet`.
   - Add all 8 to each emitted `FundamentalsQuarterRow` (null when absent). Keep the
     existing fields + the "at least one fact" row filter unchanged.
4. `src/db/queries.ts` — add the 8 fields to `FundamentalsQuarterRow` (optional
   number|null) and to `insertFundamentals`'s column list + values (the `upsert` path
   too if present). Order columns consistently.
5. `src/net/edgar-facts.test.ts` — extend the synthetic fixture with a couple of the new
   concepts (e.g. a CFO flow + a receivables instant) and assert they land on the right
   period-end rows.

## Hard constraints
Touch ONLY: prisma/migrations/0006_fundamentals_qoe_fields.sql, prisma/schema.prisma,
src/net/edgar-facts.ts, src/net/edgar-facts.test.ts, src/db/queries.ts, and this spec's
## Result. Do NOT touch the QoE tool (factory.ts) — that's the next batch. Do NOT change
existing columns/fields. No `any`. SEQUENTIAL writes, no subagents. Do NOT commit. Do NOT
run the live re-backfill (CEO does that after audit).

## Gates
`npm run verify` exit 0. `npx prisma validate` passes. `npx tsx scripts/apply-migration.ts`
applies 0006 cleanly to the real DB (idempotent).

## Wrap-up
Append `## Result`: files, test delta, confirmation prisma validate + migration apply
succeeded, and the exact CEO command to re-backfill (`npm run job -- edgar_facts` — note
it INSERT-OR-IGNOREs, so the CEO must decide force vs fresh; flag this).
