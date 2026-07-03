# web/app/story/[id]/ — Story page (dynamic)

`page.tsx` (async `params` per Next 15) loads a `StoryPage` row from the SQLite DB
via `lib/story-data.ts`, or falls back to `demoStory()` from `lib/story-types.ts`
when `id === "demo"` or the row is absent (with a "DEMO DATA" banner).

Full editorial assembly: StoryHero → StatTape → CycleStrip → setup section (optional) →
evidence chart grid (2-col, full-width last via `fullWidth`) → interactive StoryEstimator
(bear/base/bull presets from `scenarios`) → callouts → footnotes. All components live in
`components/story/` and use `story.css` for the reference-design palette (light + dark).

Server component. `force-dynamic` + `nodejs` runtime so the SQLite reader works.
