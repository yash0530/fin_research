# agy batch M3-D.1 — Portfolio thesis-decay engine (positions + mechanical decay signals)

## Why
Close the loop research → own → MONITOR. When a held name's price breaks its dossier's
stop or falls into a drawdown, the platform should say so. The dossier's free-text
`what_would_change_mind` can't be evaluated mechanically (it's prose) — so this batch
does the MACHINE-COMPUTABLE decay signals; the prose conditions become a UI checklist
(next batch). Positions persist in the existing `Position` table (symbol/qty/avgCost/
openedAt), currently unused.

## Read first
- `src/db/queries.ts` — the read helpers (`symbolClosesUpTo`, `loadCloses`, latest-close
  pattern), `loadRecCallsForGovernor`, the RecCall columns (esp. `stopPrice`, `targetLow`,
  `targetHigh`, `action`, `conviction`, `createdAt`). The Position table shape.
- `src/rules/engine.ts` — `drawdownFromCloses` (reuse for the drawdown signal).
- `src/lib/metrics.ts` — `despike`.
- `src/jobs/universe.test.ts` / `outcomes.test.ts` — the migrated-`:memory:`-DB test
  harness (createRequire node:sqlite, insertPrices, upsertTicker).

## Deliverables
1. `src/db/queries.ts` — additive position helpers:
   - `upsertPosition(db, {symbol, qty, avgCost, openedAt?})` (ON CONFLICT DO UPDATE).
   - `deletePosition(db, symbol)`. `listPositions(db)`. `latestCloseFor(db, symbol)`
     (despiked latest close, or null). `latestRecCallFor(db, symbol)` (most recent
     RecCall row for the symbol, or null).
2. NEW `src/portfolio/decay.ts` — PURE decay logic (plain inputs → findings, NO db):
   - `type PositionView = { symbol; qty; avgCost; currentPrice|null; marketValue|null;
      pnlPct|null; costBasis }`.
   - `type DecayFinding = { symbol; kind: "stop_breach"|"drawdown"|"below_cost"|
      "target_reached"; severity: "info"|"warn"|"critical"; message }`.
   - `positionView(pos, currentPrice)`: P&L math.
   - `decaySignals({ symbol, currentPrice, avgCost, closes, recCall })`: emit findings —
     **stop_breach (critical)** when recCall.stopPrice != null AND currentPrice <
     stopPrice (for a BUY-side call); **drawdown (warn)** when drawdownFromCloses(closes,
     252) <= -25; **target_reached (info)** when currentPrice >= recCall.targetHigh;
     **below_cost (info)** when currentPrice < avgCost. Skip a signal when its inputs are
     null. Pure + fully unit-tested (each kind + the null-skip).
3. NEW `src/jobs/portfolio.ts` + `portfolio_check` job (register in registry-live +
   EXPECTED test): for each Position, load currentPrice + closes + latest RecCall, run
   `decaySignals`, and return a summary detail string listing held names with critical/
   warn findings (e.g. "3 positions; ⚠ MU stop_breach @ 835; NVDA drawdown -27%").
   Never mutates positions; never throws (catch-per-item). This is what a daily glance
   or the scheduler could surface.
4. Tests: decay.ts (all kinds + null-skip), portfolio job over a fixture DB (2 positions,
   one breaching a stop → surfaced), position query round-trip.
5. `src/portfolio/CLAUDE.md` + a src/jobs note.

## Honesty
The free-text `what_would_change_mind` is NOT evaluated here (can't be, mechanically) —
do not fake it. Only the computable signals (stop/drawdown/target/cost) fire. The wwcm
checklist is a UI concern for D.2.

## Hard constraints
Touch ONLY: src/db/queries.ts, src/db/queries.test.ts, src/portfolio/decay.ts,
src/portfolio/decay.test.ts, src/jobs/portfolio.ts, src/jobs/portfolio.test.ts,
src/jobs/registry-live.ts, src/jobs/registry-live.test.ts, src/jobs/CLAUDE.md,
src/portfolio/CLAUDE.md, this spec's ## Result. Additive only. No `any`. SEQUENTIAL, no
subagents. Do NOT commit. Do NOT touch web/ (that's D.2).

## Gate
`npm run verify` exit 0. `npm run job -- --list` shows `portfolio_check`.

## Wrap-up
Append `## Result`: files, test delta, confirm the job lists + the decay kinds tested.
