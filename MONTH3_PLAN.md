# MONTH 3 — "Prove it and sharpen it"

Operating model this month (owner directive): **the CEO only thinks — specs, review,
verification, orchestration. agy implements ALL source.** Every batch is a written
spec in `scratch/agy/*.md`; agy writes the code; the CEO audits against the spec,
runs exit-gated `npm run verify`, and commits. No CEO-authored `src/`. Precise specs +
hard audits are the compensating control.

## Thesis
The platform is built (M1) and deep (M2: 20y prices, 35k fundamental quarters, memo
loop, calibration campaign). The open question is the only one that matters:
**is the research any good — and can we show it now, not in a year?** The deterministic
layer (`synthesize`, tripwires, screener, `governSize`) is PURE, so it can be replayed
over 20 years of history. That makes edge measurable today.

## Themes (ordered; each gated on the prior)

### A — Data-integrity audit (MUST be first; a backtest on dirty data is worse than none)
Verify the 20y Price series is clean: yahoo2 uses `quote.close` (raw, not adjclose) —
if any symbol carries unadjusted splits, technicals/backtests are garbage. Deliver an
`integrity_check` job + report: single-day gaps > 40% that aren't real moves (split
artifacts), long flat runs, duplicate/again-despike survivors, coverage holes. Decide:
re-fetch with adjusted closes vs. adjust in place vs. confirm-clean. NO backtest until
this passes.

### B — Deterministic backtest / replay harness (the flagship)
`as-of` variants of the market-input reads (window every price read to `<= asOf`), then
replay `synthesize` + tripwires + `governSize` as of historical month-ends over 20y.
Score forward 1m/3m/6m/12m returns of what each signal family FLAGGED vs. the universe
baseline. Output: a `backtest` job + a `/backtest` report page — "does breadth/
divergence/tripwire/momentum actually precede returns?" Honest: report null results
plainly. This is cheap (no LLM) and turns the calibration thesis into evidence.

### C — Prompt-eval harness + one measured prompt iteration
CEO reviews real dossier transcripts (thinking) and identifies weaknesses; agy builds a
golden-fixture eval (FakeProvider scripted debates + assertions on verdict discipline,
citation density, falsifiability) so a `promptVersion` bump is grounded in a measured
delta, not vibes. Then one real prompt improvement, version-bumped, with before/after.

### D — Portfolio / thesis-monitoring surface (the deferred v1 item)
Positions + owned-name tripwires (thesis-decay: a held name breaching its dossier's
`what_would_change_mind` fires a signal) + a `/portfolio` view. Closes the loop
research → own → monitor. Mostly agy UI + a thin engine rules extension.

### E — Robustness backlog (as capacity allows)
Corporate-actions handling if (A) finds splits · dossier auto-queue from the digest's
critical signals · story-page browser QA pass · anything (A)–(D) surfaces.

## Guardrails (unchanged)
Exit-gated `npm run verify` before every commit; audit every agy batch line-by-line for
logic (trust boilerplate); no broker code ever; honest TASKS.md evidence; deactivate—
never delete; additive migrations; weekly EXEC_PLAN retro. If agy hits a usage limit,
switch model (opus 4.6 ↔ flash 3.5). If a batch returns subtly wrong logic, RE-SPEC —
the CEO does not hand-fix source this month.

## Definition of done
A/B shipped with an honest edge report (even if "no measurable edge — here's why");
C with a measured prompt delta; D usable; docs + WELCOME_BACK current. The platform can
answer, with evidence, whether its own signals work.
