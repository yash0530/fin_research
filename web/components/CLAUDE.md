# web/components/ — shared UI

- `InsightList.tsx` — renders digest insights with severity styling + the evidence
  provenance line (server component).
- `ScenarioEstimator.tsx` — **client** component; recomputes `impliedPrice` (from
  `@engine/story/build`) as sliders/presets change, so the estimator matches the frozen
  scenario math exactly.
- `run-ui.tsx` — **client**; shared on-demand-run bits: the `useRunStatus()` polling hook
  (polls `getRunStatusAction` every 3s; calls `router.refresh()` when a run finishes so
  server components pull fresh rows) + the `RunStatusPill` (idle/booting/running) + button
  style. `import type`-only from the server-only status lib (no runtime server import).
- `RunStatusBar.tsx` — **client**; home-page control bar: **Refresh digest** (boots model
  for narration) + **Refresh data** (no model) buttons, disabled while a run is in progress,
  with the live status pill. Calls the `app/actions.ts` server actions.
- `CandleChart.tsx` — **client** component; pure SVG interactive multi-pane candle chart (price, volume, RSI, MACD, and event glyphs) with crosshair HUD and client-side RangeTabs.
- `CandleChart.fixtures.ts` — synthetic OHLCV fixtures and events for development.
- `WatchlistButton.tsx` — **client** component; updates candidate/watchlist state in DB.
- `InversionChecklistForm.tsx` — **client** component; records inversion checklist thesis and freezes computed payload JSON.
- `ResearchRunDrawer.tsx` — **client** component; triggers background research runs asynchronously.

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
