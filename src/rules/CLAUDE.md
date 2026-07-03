# src/rules/ — tripwire rules engine

Signals, not pages. Rules are CONFIG DATA (`src/config/tripwires.ts`); the pure
evaluators here interpret them over an injectable `RuleContext`, and a fire records a
`RuleEvent` row that the morning digest and Signals view read. Nothing is pushed
anywhere — this is a check-once dashboard. Faithful port of
`ResearchEngine/lib/rules/*` + `config/tripwires.ts`, adapted to this repo's `SqlDb`.

## Files

- `types.ts` — `TripwireRule` union (`drawdown`, `consecutive_monthly`, `flag_equals`,
  `ratio_change`, `compound`), the injectable `RuleContext` (getCloses / getSeriesLast /
  seriesValueWithin), `CloseRow` (`d` is YYYY-MM-DD), `Fired`, `RuleSeverity`.
- `engine.ts`
  - PURE: `evaluateRule(rule, ctx, firedIds)`, `interpolate` (`{value}` only),
    `underCooloff(lastFiredAt, cooloffDays, now)`, `drawdownFromCloses`, `addDaysStr`,
    `todayStr` — no I/O, unit-tested with fixtures.
  - `sqlRuleContext(db)` — builds a context from `Price` (despiked on read) + `ManualSeries`.
  - `runAllRules(db, tripwires, opts)` — two-phase (simple then compound; compounds see
    the fired set from the same pass), per-rule cooloff via `recentRuleEvents`, persists
    fresh fires via `insertRuleEvent` (skipped when `dryRun`). `runRulesJob` = a summary line.

## Invariants

- Rules are data; the engine never hardcodes a symbol or threshold.
- Never-throw: missing prices / too-few shared dates → skip silently, never crash.
- Market dates are YYYY-MM-DD strings; only cooloff arithmetic uses `Date`.

## Tests

`engine.test.ts` — every evaluator (threshold edges, mixed signs, too-few readings,
compound gating + capex-raise suppression), `underCooloff` boundaries, `interpolate`,
plus a real migrated `node:sqlite` DB: drawdown fires → RuleEvent recorded → re-run
cooloff-suppressed; compound memory_exit fires only with ddr5 and no recent capex raise;
`dryRun` persists nothing.
