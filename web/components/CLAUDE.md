# web/components/ — shared UI

- `InsightList.tsx` — renders digest insights with severity styling + the evidence
  provenance line (server component).
- `ScenarioEstimator.tsx` — **client** component; recomputes `impliedPrice` (from
  `@engine/story/build`) as sliders/presets change, so the estimator matches the frozen
  scenario math exactly.
