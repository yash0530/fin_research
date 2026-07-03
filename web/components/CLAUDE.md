# web/components/ — shared UI

- `InsightList.tsx` — renders digest insights with severity styling + the evidence
  provenance line (server component).
- `ScenarioEstimator.tsx` — **client** component; recomputes `impliedPrice` (from
  `@engine/story/build`) as sliders/presets change, so the estimator matches the frozen
  scenario math exactly.

## story/ — editorial story-page components

All components are scoped by the `.story-page` wrapper class in `story.css`.

- `story.css` — full custom-property palette (light + dark via `prefers-color-scheme`),
  typography scale, layout grid, and component styles matching the reference design.
- `StoryHero.tsx` — kicker / eyebrow / h1 / lead paragraph + verdict badge with
  conviction level (server component).
- `StatTape.tsx` — responsive KPI grid tape with big values and delta up/down coloring
  (server component).
- `CycleStrip.tsx` — 4 colored bands with a positioned marker (0..1) + tick labels
  (server component).
- `EvidenceChart.tsx` — **client** component; recharts bar/line from frozen series data
  with value labels and negative-value danger coloring.
- `StoryEstimator.tsx` — **client** component; interactive scenario sandbox with
  revenue/margin/P/E sliders, preset buttons, live cycle strip, and callout. Uses the
  engine's `impliedPrice` formula (mirrored locally in `story-types.ts`).
- `Callout.tsx` — accent-soft background block with left accent border and optional
  bold title (server component).
- `Footnotes.tsx` — footer "How to read this" section with disclaimer lines
  (server component).
