# src/ — engine source

The deterministic brain of ENGINE. Everything here is pure TypeScript, strict-typed,
and unit-tested with vitest — no live network or LLM required to run the suite.

## Module map

| Dir | Role |
|---|---|
| `analyst/` | LLM plumbing: JSON salvage, the `completeJson` retry harness, the per-endpoint lock, the provider abstraction, `FakeProvider`, and the on-demand `llama-lifecycle` (boot/wait/kill the local model) |
| `lib/` | pure primitives (despike, metrics) used by every read path |
| `config/` | provider profiles, per-role model routing, dual sector taxonomy |
| `tools/` | evidence ledger, budget, cache, registry, and the ported quant tools |
| `screener/` | full-universe screening engine |
| `screens/` | individual stock screen modules (fscore, accruals, dilution, cohort, earnings-trend) |
| `runs/` | on-demand research runs (budget, safety, reconcile, create, runner) |
| `dossier/` | multi-agent debate engine (resumable, single-flight) |
| `research/` | deterministic digest synthesis |
| `rules/` | tripwire evaluators (injectable ctx, cooloff) → RuleEvents |
| `calibration/` | sizing governor + outcome horizon math |
| `buylist/` | monthly $2,500 allocation |
| `capture/` | paste-capture parser + prompt renderer |
| `story/` | editorial story-page composer |

## Conventions

- Tests are co-located as `*.test.ts` next to the module they cover.
- Every LLM call goes through `analyst/completeJson` under `analyst/withLlmLock`.
- Market dates are `YYYY-MM-DD` strings; never `Date` for a bar/close.
- Pure functions over injectable data — no module reaches for a global DB/clock/network.
