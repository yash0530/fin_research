# agy batch — Flagship story-page UI (web/, NEXT_RUN Phase 4.5)

## Intent
Build the Micron-style editorial story page in the Next.js app. The design spec is
the user's hand-built page at `docs/reference-micron.html` — REPLICATE that aesthetic
(typography scale, KPI tape, cycle strip with colored bands + marker, card grid,
callout, honest footnotes, dark/light via CSS custom properties + prefers-color-scheme,
tabular-nums for all figures) as React components fed by typed data. No Chart.js —
use recharts.

## Ground rules
- Work ONLY inside `web/` (its own package.json is yours; add `recharts`). NEVER touch
  the repo root: no root package.json, no `src/**`, no `prisma/**`, no `TASKS.md`.
- Follow the existing patterns: `web/lib/live.ts` shows how pages read the SQLite DB;
  `web/components/ScenarioEstimator.tsx` is the existing client island (keep its math:
  impliedPrice = revenue × margin × P/E ÷ sharesOut; restyle to match the reference).
- The data contract is `StoryPageData` as defined in root `src/story/schema.ts` — read
  that file for the exact shape (symbol/title/asOf/priceAtBuild/hero/statTape/
  cycleStrip/scenarios/callouts/footnotes) and MIRROR the type locally in
  `web/lib/story-types.ts` (web must not import from root src/).
- Every displayed number gets `font-variant-numeric: tabular-nums`. Dark mode must
  work (the reference's :root / @media pattern).

## Deliverables
1. `web/lib/story-types.ts` — mirrored StoryPageData types + a `demoStory()` fixture
   (a Micron-flavored example with realistic values, clearly labeled DEMO).
2. `web/lib/story-data.ts` — `loadStoryPage(id)`: reads a `StoryPage` row
   (`storyJson` column) from the SQLite DB following the `lib/live.ts` pattern;
   returns parsed StoryPageData or null. `listStoryPages()`: id/symbol/title/createdAt
   list, newest first. If the table is missing/empty, return null/[] (never throw).
3. `web/components/story/` — `StoryHero.tsx` (kicker/eyebrow/h1/lead + verdict badge
   with conviction), `StatTape.tsx` (responsive grid tape, delta up/down coloring),
   `CycleStrip.tsx` (4 colored bands + positioned marker + tick labels, position 0..1),
   `EvidenceChart.tsx` (recharts bar/line from frozen series; value labels; neg values
   in the danger color), `Callout.tsx`, `Footnotes.tsx`, plus `story.css` (or CSS
   module) carrying the reference's custom-property palette (light + dark).
4. `web/app/story/[id]/page.tsx` — full editorial assembly: hero → tape → cycle strip
   → evidence chart grid (2-col, full-width last) → interactive ScenarioEstimator
   (bear/base/bull presets from `scenarios`) → callouts → footnotes. Falls back to
   `demoStory()` when id === "demo" or the DB row is absent (banner: "DEMO DATA").
5. `web/app/story/page.tsx` — archive index listing real StoryPage rows + a link to
   /story/demo.
6. Update `web/CLAUDE.md` + `web/components/CLAUDE.md` module maps.

## Gates (fix until green)
- `cd web && npm install && npm run build` — compiles + type-checks.
- No ESLint suppressions; no `any` unless unavoidable (justify in ## Result).

## Wrap-up
Append `## Result` to THIS file: files created, build status, any deviations from the
reference design and why. Do NOT commit. Do NOT touch anything outside web/ (plus this file).

## Result

### Files created / modified

| File | Status | Notes |
|------|--------|-------|
| `web/components/story/Callout.tsx` | **completed** | Was truncated at 4 lines; now full component with optional `title` prop |
| `web/app/story/[id]/page.tsx` | **rewritten** | Full editorial assembly: hero → tape → strip → chart grid → estimator → callouts → footnotes. Demo fallback with banner. No `@engine/*` imports |
| `web/app/story/page.tsx` | **created** | Archive index listing DB rows + permanent `/story/demo` link |
| `web/components/story/EvidenceChart.tsx` | **fixed** | Recharts `Tooltip.formatter` type mismatch — `ValueType` union now handled via `Number(value)` cast instead of narrowing to `number` param |
| `web/CLAUDE.md` | **updated** | Added story page system documentation |
| `web/components/CLAUDE.md` | **updated** | Full `story/` component module map |
| `web/lib/CLAUDE.md` | **updated** | Documented `story-types.ts` and `story-data.ts` |
| `web/app/story/CLAUDE.md` | **updated** | Documents archive index + [id] editorial page |
| `web/app/story/[id]/CLAUDE.md` | **updated** | Full component breakdown for the editorial page |

### Previously-created files (unchanged, already correct)

`web/lib/story-types.ts`, `web/lib/story-data.ts`, `web/components/story/story.css`,
`StoryHero.tsx`, `StatTape.tsx`, `CycleStrip.tsx`, `Footnotes.tsx`, `StoryEstimator.tsx`.

### Build status

```
✓ Compiled successfully in 1062ms
✓ Generating static pages (8/8)
  /story      — ƒ (Dynamic)
  /story/[id] — ƒ (Dynamic, 115 kB first load)
```

No ESLint suppressions. No `any` types used.

### Deviations from reference design

1. **No Chart.js** — per spec, all charts use recharts instead. The recharts API differs
   (declarative JSX vs imperative canvas), so the exact rendering style has minor
   differences (SVG vs canvas, built-in recharts tooltip vs Chart.js tooltip), but the
   data, colors, and layout match the reference.
2. **StoryEstimator vs ScenarioEstimator** — the editorial page uses the new
   `StoryEstimator` (from `components/story/`) which is styled to match the reference
   design. The old `ScenarioEstimator` (from `components/`) is untouched and still
   used by the legacy `lib/demo.ts` page.
3. **Callout component** — added optional `title` prop for flexibility; the reference
   uses inline `<b>` tags which are still supported via `children`.

