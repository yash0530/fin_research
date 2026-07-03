# src/research/ — deterministic digest synthesis

The accuracy-first backbone. `synthesize(input, caps)` turns stored facts into ranked
insights, **each carrying an `evidence` provenance string** — the LLM never invents
here, it only narrates this output. Generalized from ENGINE's `synthesize.ts` to the
full market. `buildMarketInputs(db, asOf)` (in `market-inputs.ts`) derives the
market-computed half of a `SynthInput` from the price book so the digest is fed
everything it can support — not just tripwires.

## synthesize.ts

Families: `breadth` (% above 50-day MA), `movers` (top gainers/losers), `gics_pulse`
and `ai_pulse` (sector extremes), `divergence` (sector vs hyperscaler capex proxy),
`tripwire` (pass-through risk signals + persisted `RuleEvent`s), `credit` (HYG/IEF
financing-stress trend), `catalysts` (dated events inside the **next-14-day** window),
and `data_health` (stale prices, suspect despiked ticks, failed job runs). Severity
`info | warn | critical`.

Discipline:
- **Provenance on every insight** — `evidence` is never empty (tested).
- **Hard caps** — `perFamily` (default 3) then a `total` cap (default 20), but **all
  criticals survive** the cap so a memory-exit tripwire is never truncated away.
- Headline is derived from the critical count (never invented).
- **Catalyst window = 14 days** (`T.catalystWindowDays`, donor parity). The prior 7-day
  window fell just short of the quarterly earnings cluster (nearest ~12d out), so the
  catalysts family went silent despite a full book — widened here and in `runDigestJob`.

## market-inputs.ts

`buildMarketInputs(db, asOf)` reads Price / Sector / TickerSector and returns the
`breadth | movers | gicsPulse | aiPulse | divergences | credit | dataHealth` slice of a
`SynthInput` (ruleEvents / catalysts / failed-jobs stay owned by the digest job).
Ported from the read-only donor `ResearchEngine/lib/analyst/snapshot.ts` +
`lib/research/synthesize.ts`.

Discipline:
- **Despiked, never raw** — closes go through `../lib/metrics.despike` before any metric.
- **Fresh-only move metrics** — 1-day / 30-day / 50-dma / advancers-decliners count only
  symbols that traded on the newest date; delisted stragglers surface *only* in
  `dataHealth.stalePriceCount` (last bar lagging the book by > 3 sessions, or absent).
- **Basket semantics** — divergence measures each `ai_*` sector's equal-weight 30d move
  against the hyperscaler basket (MSFT/GOOGL/AMZN/META); credit is the HYG/IEF ratio
  change over ~30 date-aligned sessions (≥5 shared dates or null).
- **Never throws** — every field is omitted (or null) when the data is missing.

## Tests

`synthesize.test.ts` — provenance-on-every-insight, criticals kept under a tight cap,
weak-breadth warning, ≥30pp divergence = critical, per-family cap, quiet-tape fallback,
and the **14-day** catalyst window.
`market-inputs.test.ts` — over a fixture DB: breadth (fresh-only), mover ranking +
sub-$2/benchmark exclusion, taxonomy-split pulses, ai_* divergences vs the basket, the
HYG/IEF credit ratio, data-health age + straggler counting, and empty-book/missing-pair
degradation.
