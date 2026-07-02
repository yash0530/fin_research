# src/research/ — deterministic digest synthesis

The accuracy-first backbone. `synthesize(input, caps)` turns stored facts into ranked
insights, **each carrying an `evidence` provenance string** — the LLM never invents
here, it only narrates this output. Generalized from ENGINE's `synthesize.ts` to the
full market.

## synthesize.ts

Families: `breadth` (% above 50-day MA), `movers` (top gainers/losers), `gics_pulse`
and `ai_pulse` (sector extremes), `divergence` (sector vs hyperscaler capex proxy),
`tripwire` (pass-through risk signals). Severity `info | warn | critical`.

Discipline:
- **Provenance on every insight** — `evidence` is never empty (tested).
- **Hard caps** — `perFamily` (default 3) then a `total` cap (default 20), but **all
  criticals survive** the cap so a memory-exit tripwire is never truncated away.
- Headline is derived from the critical count (never invented).

## Tests

`synthesize.test.ts` — provenance-on-every-insight, criticals kept under a tight cap,
weak-breadth warning, ≥30pp divergence = critical, per-family cap, quiet-tape fallback.
