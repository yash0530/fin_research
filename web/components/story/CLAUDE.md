# web/components/story/ — flagship editorial story components

The Micron-page design system as React components (reference:
`docs/reference-micron.html` — edit with it open). All figures use
`tabular-nums`; palette + dark mode live in `story.css` custom properties
(`prefers-color-scheme`), mirroring the reference exactly.

- `StoryHero` — kicker / eyebrow / display headline / lead + verdict badge (conviction-colored).
- `StatTape` — responsive KPI grid tape; delta up/down coloring.
- `CycleStrip` — 4 colored bands + positioned marker (position 0..1) + tick labels.
- `EvidenceChart` — recharts bar/line over FROZEN series from StoryPageData;
  value labels; negatives in the danger color. (recharts, never Chart.js.)
- `StoryEstimator` — client island; impliedPrice = revenue × margin × P/E ÷ sharesOut,
  bear/base/bull presets, recomputed client-side. (The legacy
  `components/ScenarioEstimator` remains for the old demo page only.)
- `Callout` — accent-left callout, optional title.
- `Footnotes` — the honest-footnotes block.

Data contract: `web/lib/story-types.ts` (mirror of root `src/story/schema.ts` — keep
in sync manually; web never imports root src). Pages render fully without narration.
