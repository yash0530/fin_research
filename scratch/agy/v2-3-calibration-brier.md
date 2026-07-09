# v2-3 — Avoid-ledger, decision streaks, Brier calibration tracker

Read first: `src/calibration/CLAUDE.md`, `src/calibration/governor.ts` (`CalRec`, `Action`, `Conviction`, `isFavorable`, `tierStats` — REUSE these types + `isFavorable`), `src/calibration/outcomes.ts` (`horizonReturns`, `HorizonReturns`). RecCall fields (see `prisma/schema.prisma`): action (BUY|HOLD|TRIM|AVOID|SELL), conviction (HIGH|MEDIUM|LOW), priceAtCall, targetLow/High, outcome1m/3m/6m/1yPct, thesisFalsified, createdAt. All pure, fixture-tested — no DB in the module.

## Build — `src/calibration/scorecard.ts` (pure over `CalRec[]`)

1. **Brier score** — `brierScore(recs, horizon)`: map each resolved rec to an implied favorable-probability from (action, conviction) — document the mapping table in-code (e.g. BUY/HIGH→0.80, BUY/MED→0.65, BUY/LOW→0.55, HOLD→0.50, TRIM/AVOID/SELL→symmetric downside, i.e. implied p(favorable) low). Outcome = `isFavorable(rec)` at the chosen horizon (1 if favorable, 0 if not; skip nulls). Brier = mean((p − outcome)²) over resolved recs; also return `count`, `meanForecast`, `meanOutcome` (calibration gap). Lower Brier = better calibrated.
2. **Avoid-ledger** — `avoidLedger(recs)`: over AVOID (and SELL) calls that have resolved, a "good avoid" = the name FELL or underperformed after the call (outcome negative). Return `{total, goodAvoids, badAvoids /*avoided a winner*/, hitRate, entries: {symbol, createdAt, outcomePct, correct}[]}`.
3. **Streaks** — `decisionStreaks(recs)`: order resolved recs by createdAt; a "correct" call = `isFavorable` true for BUY-side, false-outcome-correct for AVOID-side. Return `{current: {kind:"correct"|"incorrect", length}, longestCorrect, longestIncorrect}`.
4. **`buildScorecard(recs, horizon="3m")`** — bundles brier + avoidLedger + streaks + `tierStats` (reuse) into one `Scorecard` object for the journal console.

## Wire-in
- `web/lib/calibration-data.ts`: add a `loadScorecard()` reader that pulls resolved `RecCall` rows and calls `buildScorecard`. Surface it on `/journal`'s calibration/governor console (a compact panel: Brier + calibration gap, avoid hit-rate, current streak) using existing `web/components/ui/` primitives — NO Tailwind classes (semantic classes in globals.css only). Real EmptyState when <5 resolved recs.

## Tests & docs
`src/calibration/scorecard.test.ts` — Brier on a hand-set of recs (perfect calibration → low Brier; all-wrong → high), avoid-ledger good/bad classification, streak counting incl. the current-run edge, <5-rec insufficient handling. Update `src/calibration/CLAUDE.md`, `web/lib/CLAUDE.md`, `web/app/journal/CLAUDE.md`.

## Gates (fix until green)
`npm run typecheck` · `npm test` · `npm run check:claude` · `cd web && npm run build`. Append `## Result`. Do NOT commit. Touch only: src/calibration/scorecard*, web/lib/calibration-data.ts, web/app/journal/** (console panel), web/app/globals.css (any new semantic classes), affected CLAUDE.md.
