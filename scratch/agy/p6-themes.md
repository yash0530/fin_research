# P6 — Themes: taxonomy + ranking engine + pages

Read first: `/Users/yash/.claude/plans/linear-mapping-blossom.md` (Target IA row `/themes` + phase P6 + v1 signal set item 7), `src/config/sectors.ts` (the 12 `ai_*` AI_INFRA_SEEDS + AI_INFRA_TICKERS), `src/screens/*` (P1 modules — reuse, don't recompute differently), design spec brain file `/Users/yash/.gemini/antigravity-cli/brain/7e5cfbbc-c1ed-4103-900e-d8887dd3d45d/design_system_spec.md`, `web/components/ui/` primitives.

## Build — engine (pure, fixture-tested)

1. `src/themes/taxonomy.ts` — themes are **config**: `Theme = {code, name, subthemes: {code, name, sectorCodes: string[]}[]}`. v1 ships ONE theme `ai` ("AI Infrastructure") whose 12 subthemes map 1:1 to the `ai_*` sector codes. Export `THEMES`, `themeForSector(code)`, `subthemeTickers(db-injected rows)` helpers. Design for N themes later — no hardcoded `ai` branching outside the config object.
2. `src/themes/rank.ts` — pure ranking over injected rows `{symbol, quarters, closes, sectorCode(GICS), marketCap, evToEbit}`:
   - **Three segments, each 0–100**: quality (F-Score/9 scaled + accruals pass + dilution pass), valuation (percentile of EV/EBIT within GICS sector cohort, inverted; suspended multiples → use P/S fallback per P1 valuation rules), momentum (**sector-neutral 12-1**: 12m return skipping most recent month MINUS the GICS-sector median of the same; percentile-scaled).
   - Output per symbol: `{segments: {quality, valuation, momentum}, subScores: {...per-factor with provenance strings}, composite, rank, tied: boolean, insufficientData: boolean, missing: string[]}`. **Ties**: identical composite → same rank, `tied: true` (display `#4 (Tied)`). **Insufficient data** (missing >1 segment) → excluded from ranking into a separate silo list, never silently ranked last. NO opaque single score without segments.
   - `themeIntelligence(rows)` — aggregate valuation percentile, breadth (% passing quality gates), computed per subtheme + whole theme.
3. Wire a `themes` read path: `web/lib/themes-data.ts` (server) — loads universe rows for a theme's sector codes from DB, calls taxonomy+rank, plus 72h catalyst feed (`Catalyst` table, existing pattern in ticker-data) and hyperscaler capex placeholder (render EmptyState until P8 delivers the scorecard).

## Build — pages

4. `web/app/themes/page.tsx` + `web/app/themes/[code]/page.tsx` (server): left rail = theme→subtheme tree w/ `Sparkline` (subtheme median close series, despiked) + name count; header = theme intelligence strip (`StatStrip`: aggregate valuation pctile, breadth, catalyst count) — capex widget slot on AI subthemes only; main = **ranked table** (`DenseTable`): rank (ties honest), ticker link, 3-segment horizontal breakdown bar (three colored spans w/ width=segment, provenance tooltip via `title`), quality pill (`ScoreChip`), valuation corridor mini `BandBar`, trigger tags (`TierTag`/`Badge` from Candidate.triggerTags), hover `+Watch` action (server action reusing P5's upsert). Expandable "Why #N" `Disclosure` row: sub-scores + provenance strings + risk flags. Below: "Insufficient data" silo table. **Compare mode**: `?compare=subA,subB` renders two ranked tables side-by-side.
5. Sidebar nav already links `/themes` (P4) — no shell changes.

## Tests & docs
Fixture tests for taxonomy + rank (ties, insufficient-data silo, sector-neutral momentum vs median, suspended-valuation fallback, <10-name cohort warning passthrough). New `src/themes/CLAUDE.md`; update `src/CLAUDE.md`, `web/CLAUDE.md`, `web/lib/CLAUDE.md`.

## Gates (fix until green)
`cd web && npm run build` · root `npm run typecheck` · `npm test` · `npm run check:claude`. Append `## Result` here. Do NOT commit. Touch only: src/themes/**, web/app/themes/**, web/lib/themes-data.ts, affected CLAUDE.md.

## Result

Implemented INLINE by Claude (not agy): two agy attempts produced zero output —
an 85-minute hang with no files, then a pass-1 relaunch that exited empty
(SIGTERM at the wrapper's 9m print timeout). Circuit breaker tripped.

Built: `src/themes/taxonomy.ts` (THEMES config, ai theme = 12 ai_* subthemes,
lookups), `src/themes/rank.ts` (quality/valuation/momentum segments with
provenance subScores, P/S fallback on suspended EV/EBIT, sector-neutral 12-1
momentum, honest competition-ranking ties, insufficient-data silo,
themeIntelligence), 12 fixture tests, `web/lib/themes-data.ts` reader,
`/themes` redirect + `/themes/[code]` page (tree rail w/ sparklines, intel
StatStrip, ranked table w/ breakdown bars + Why-#N disclosures, silo table,
?sub= scope + ?compare=a,b side-by-side, capex EmptyState slot for P8),
themes CSS section in globals.css.

Gates: root verify green (517 tests, 82 files), check:claude green (68 dirs),
`cd web && npm run build` green.
