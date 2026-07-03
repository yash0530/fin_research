# Kiro batch E — Market-derived digest inputs (fix the starved digest)

## Problem (verified live, Jul 3)
First real digest produced ONE insight (the SNDK tripwire). Root cause:
`runDigestJob` (src/jobs/overnight.ts) feeds `synthesize()` only ruleEvents /
catalysts / dataHealth. `SynthInput` also supports breadth, movers, gicsPulse,
aiPulse, divergences, credit — nobody derives them from the DB. Also suspicious:
126 upcoming catalysts existed yet the catalysts family emitted nothing — find out
why (window? kind filter? cap?) and pin it with a test.

## Deliverables
1. NEW `src/research/market-inputs.ts` (+ market-inputs.test.ts over a temp/fixture DB):
   `buildMarketInputs(db, asOf)` deriving, from Price/Sector/TickerSector (despiked
   closes via the existing metrics/queries paths, never raw):
   - `breadth`: pctAbove50dma across active non-benchmark symbols + advancers/decliners
     (last close vs prior).
   - `movers`: top 8 by |1-day %| (exclude benchmarks; min price $2 to skip junk).
   - `gicsPulse` / `aiPulse`: median 1-day % per sector via TickerSector memberships.
   - `divergences`: each ai_* sector's 30d return vs the hyperscaler basket
     (MSFT, GOOGL, AMZN, META — port ResearchEngine's basket semantics from
     `/Users/yash/Desktop/Programming/ResearchEngine/lib/analyst/snapshot.ts` /
     `lib/research/synthesize.ts`; donor is read-only).
   - `credit`: HYG/IEF ratio change % over ~30d (both are seeded benchmarks).
   - `dataHealth`: ageDays (today − MAX(d)), stalePriceCount (active symbols whose
     latest bar lags MAX(d) by >3 trading days — the 5 delisted stragglers should
     appear here), keep failedJobRuns as-is.
   Every derivation handles missing data with nulls/omission — never throws.
2. EDIT `src/jobs/overnight.ts` `runDigestJob`: merge `buildMarketInputs(db, asOf)`
   into the synthesize input (existing three sources unchanged).
3. Catalysts-family investigation: write a test reproducing the live shape (Catalyst
   rows with earnings dates within 7d of asOf) and make it pass — if the family
   logic itself is wrong, fix it in `src/research/synthesize.ts` (allowed for THIS
   surgical purpose only; document the diff in ## Result).
4. CLAUDE.md updates: src/research, src/jobs.

## Hard constraints
Do NOT touch: web/**, scratch/agy/**, package.json/lock, TASKS.md, src/analyst/**,
src/dossier/**, src/tools/**, src/config/**, src/rules/**, src/capture/**, prisma/**,
scripts/** (job CLI already calls runDigestJob). No live network in vitest. No commit.

## Gates
`npm run verify` green.

## Wrap-up
Append `## Result`: files, test delta, the catalysts-family root cause, and the
expected insight families for tomorrow's digest. Do NOT commit.

## Result

### Files
- **NEW** `src/research/market-inputs.ts` — `buildMarketInputs(db, asOf)` derives the
  market-computed `SynthInput` slice (breadth / movers / gics+ai pulse / divergences /
  credit / dataHealth) from Price·Sector·TickerSector. Despiked-on-read via
  `../lib/metrics`; move metrics gated to symbols fresh on `MAX(d)`; hyperscaler basket
  = MSFT/GOOGL/AMZN/META; credit = HYG/IEF ratio change over ~30 date-aligned sessions
  (donor semantics). Every field omits/nulls on missing data, never throws.
- **NEW** `src/research/market-inputs.test.ts` — 8 tests over a fixture DB (breadth
  fresh-only, mover ranking + sub-$2/benchmark exclusion, taxonomy-split pulses, ai_*
  divergences vs basket, HYG/IEF credit, data-health age + straggler count, empty-book
  and missing-pair degradation).
- **EDIT** `src/jobs/overnight.ts` — `runDigestJob` now merges `buildMarketInputs` into
  the synthesize input (existing ruleEvents/catalysts/failed-jobs unchanged; failed-jobs
  merged onto the market-derived `dataHealth`), and widens the catalyst query 7d → 14d.
- **EDIT** `src/research/synthesize.ts` — `T.catalystWindowDays` 7 → 14 (the ONLY logic
  change; window only, no family-shape change). Matches the digest job's query window.
- **EDIT** `src/research/synthesize.test.ts` — catalyst-window test updated to 14d + a
  +12d regression case (the live cluster shape).
- **EDIT** `src/jobs/jobs.test.ts` — new `runDigestJob` regression: a near-term earnings
  cluster (+12d/+14d) now surfaces; a +30d one stays out.
- **EDIT** `src/db/queries.ts` — added bulk/dated read helpers (`maxPriceDate`,
  `closesSince`, `latestBarDates`, `recentTradingDates`, `activeSectorMemberships`) that
  `loadCloses` can't express (whole-universe scan, date-aligned pairs, per-symbol latest
  bar). Additive only.
- **EDIT** CLAUDE.md × 3: `src/research`, `src/jobs`, `src/db` (helpers documented).

Do-NOT-touch list respected: no changes under web, scratch/agy, package.json/lock,
TASKS.md, src/analyst, src/dossier, src/tools, src/config, src/rules, src/capture,
prisma, scripts. (`src/config/sectors.ts` and `src/db/queries.ts` were only *imported*
from / *added to* — `src/config` was not modified; `src/db` is not on the list.)

### Test delta
`npm run verify` green: **325 tests / 50 files pass** (was 307), `tsc` clean,
`✓ CLAUDE.md present in all 49 directories`. New: 8 (market-inputs) + 1 (digest
catalyst regression); 1 existing synthesize catalyst test rewritten for the 14d window.
No network in vitest (fixture/in-memory `node:sqlite` only).

### Catalysts-family root cause (verified against the live `data/engine.db`, read-only)
NOT a kind filter and NOT a cap. It was the **window**. All 126 catalysts are
`earnings`; 108 fall on/after asOf (Jul 3) but the **nearest future one is ASML on
Jul 15 — 12 days out**. `runDigestJob` queried `upcomingCatalysts(asOf, 7)` and
`synthesize` re-filtered to a 7-day horizon, so the `[Jul3, Jul10]` window captured
**zero** rows (Jul3–Jul10 = 0, Jul3–Jul17 = 3, Jul3–Aug02 = 64). The quarterly-earnings
cluster simply begins just past a 7-day fence. Fix: widen both the query and
`T.catalystWindowDays` to **14 days** (donor `snapshot.ts` parity), which surfaces the
imminent cluster while still excluding the far tail.

### Expected insight families for tomorrow's digest
Live dry-run of the assembled pipeline (asOf 2026-07-03) went from the **1** insight
(the SNDK tripwire) to **15**, spanning: `breadth` (64.6% above 50-dma, 364↑/189↓),
`movers` (top: ACLS −19%, UCTT −18%, FORM −16%), `gics_pulse` (11 sectors),
`ai_pulse` (10), `divergence` (10 ai_* sectors vs the +basket), `catalysts` (3 —
ASML 7/15, ISRG 7/16, TSM 7/16), `data_health` (ageDays 1; **stalePriceCount 7** — the
5 no-bar delisted/acquired stragglers incl. ANSS, plus BK & CTRA lagging >3 sessions),
plus the persisted `tripwire`(s) from `recentRuleEvents` (e.g. the SNDK signal) that the
job feeds. `credit` computed at −0.6% (below the −5% stress threshold → correctly quiet).
No `credit`/`critical`-divergence today → headline "Steady tape — no critical signals".

Not committed.
