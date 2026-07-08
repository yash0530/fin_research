# src/runs/ — on-demand research runs

- `budget.ts` — `getBudgetConfig(runType, budgetSeconds)`: maps run types (`ticker_dossier`, `theme_sweep`, `watchlist_reunderwrite`, `filing_diff`, `open_question`) and budgeted seconds to multi-agent configurations and model profile, clamped to 15m–5h.
- `safety.ts` — `checkHardwareThrottling(db, runId, opts)`: checks macOS thermal warnings (`CPU_Speed_Limit < 50` → 30s pause) and battery status (unplugged and `< 25%` → abort run) to protect hardware during model inference.
- `reconcile.ts` — `reconcileRuns(db, opts)`: reclaims database states of orphaned runs (where the process PID has died) to `FAILED` and releases stale cross-process run locks.
- `create.ts` — `createResearchRun(db, opts)`: creates a fresh `ResearchRun` in the database, defaulting its status to `PENDING`.
- `runner.ts` — `OnDemandResearchRunner`: coordinates step planning, budget check wall-clock loops (with 5-minute / 10% synthesis buffer), hardware safety checking, execution of step checkpoints (skipping completed ones), and compilation of final or partial reports as markdown files in `data/research/<runId>.md`.

## Tests

- `runs.test.ts` — unit tests verifying budget calculations, safety parsers, process/lock reconciliations, and the runner execution loop (graceful budget timeouts, step resume logic, and pause/cancel signaling).
