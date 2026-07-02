# src/ — engine source

The deterministic brain of ENGINE. Everything here is pure TypeScript, strict-typed,
and unit-tested with vitest — no live network or LLM required to run the suite.

## Module map

| Dir | Role |
|---|---|
| `analyst/` | LLM plumbing: JSON salvage, the `completeJson` retry harness, the per-endpoint lock, the provider abstraction, and `FakeProvider` |
| `lib/` | pure primitives (despike, metrics) used by every read path |
| `config/` | provider profiles, per-role model routing, dual sector taxonomy |
| `tools/` | evidence ledger, budget, cache, registry, and the ported quant tools |
| `screener/` | full-universe screening engine |
| `dossier/` | multi-agent debate engine (resumable, single-flight) |
| `research/` | deterministic digest synthesis |
| `calibration/` | sizing governor + outcome horizon math |
| `buylist/` | monthly $2,500 allocation |
| `capture/` | paste-capture parser + prompt renderer |
| `story/` | editorial story-page composer |

## Conventions

- Tests are co-located as `*.test.ts` next to the module they cover.
- Every LLM call goes through `analyst/completeJson` under `analyst/withLlmLock`.
- Market dates are `YYYY-MM-DD` strings; never `Date` for a bar/close.
- Pure functions over injectable data — no module reaches for a global DB/clock/network.
