# src/story/ — editorial story-page composer

The flagship output: a Micron-style interactive editorial page per dossier. This module
is the deterministic, frozen DATA behind it (React components + Qwen narrative layer on top).

## Files

- `schema.ts` — zod `StoryPageData`: hero (thesis/verdict/conviction), statTape (with
  evidenceRef), cycleStrip (stage + 0..1 position), 3 scenarios (revenue/margin/pe/shares),
  callouts, footnotes, `asOf` + `priceAtBuild` frozen at build.
- `build.ts`:
  - `impliedPrice(scenario)` = **revenue × margin × P/E ÷ shares** — the scenario
    estimator's formula, recomputed client-side by the React `ScenarioEstimator`.
  - `scenarioPrices(data)` — bear/base/bull implied prices.
  - `buildStory(input)` — validate + freeze (throws on invalid shape).
  - `baseUpsidePct(data)` — base implied vs frozen build price.
- `narrate.ts` — `narrateStory(provider, data)`: optional Qwen prose over already-true
  facts (thinking OFF, invents nothing); the page renders fully without it. FakeProvider-tested.

## Invariants

- Data is frozen at build so an archived page never drifts; the live quote is shown
  alongside `priceAtBuild`, never merged into it.

## Tests

`build.test.ts` — golden scenario math vs the hand-built Micron reference ($98.18),
monotonic bear<base<bull, base upside, schema rejection of an out-of-range payload.
