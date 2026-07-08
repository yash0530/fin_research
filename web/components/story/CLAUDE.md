# web/components/story/ — shared layout stylesheet

Only `story.css` remains after the P7 route deletions: a full custom-property
palette (light + dark via `prefers-color-scheme`), typography scale, layout
grid, and component classes (`.story-page`, `.hero`, `.kicker`, `.story-h1`/
`.story-h2`, `.lead`, `.verdict-badge`, `.panel`, `.tape`/`.cell`, `.callout`,
etc.). It is imported by exactly one surviving page —
`app/tickers/[symbol]/page.tsx` — which still uses these classes for its hero
header and section framing. **Do not delete this file**: it is not orphaned.

The editorial story-page React components that used to live alongside it
(`StoryHero.tsx`, `StatTape.tsx`, `CycleStrip.tsx`, `EvidenceChart.tsx`,
`StoryEstimator.tsx`, `Callout.tsx`, `Footnotes.tsx`) were deleted in P7 along
with the `/story` and `/story/[id]` routes they served — grep confirmed zero
other importers. `web/lib/story-types.ts`/`story-data.ts` were deleted with
them; `src/story/*` (the engine module) stays.
