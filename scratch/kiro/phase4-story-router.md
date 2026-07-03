# Kiro batch G — Story-page persistence + sector-router fix

## Problems (from the live MU dossier, Jul 3)
1. `classify()` routed MU to the `generic` analyzer — the semis KPI framing (HBM/DRAM
   cycle) never reached the debate. The router must use the DB: GICS membership +
   `industry` (Ticker/sp500 data) + ai_* memberships → one of the 8 analyzer keys
   (semis/saas/banks/biotech/energy/consumer/reits/generic). MU (industry
   "Semiconductors...", ai_* member) MUST map to `semis` — pin with tests (also:
   JPM→banks, O→reits if present, XOM→energy, a no-data symbol→generic).
2. Dossiers produce no story page. Wire the flagship: after the memo stage, build
   `StoryPageData` (src/story/build.ts) from the verdict + evidence + real prices/
   fundamentals, narrate optionally (src/story/narrate.ts, thinking OFF, page must
   render without it), persist. web/lib/story-data.ts already reads a `StoryPage`
   table — CHECK prisma migrations: if the table is missing (likely drift #4), add
   additive migration 0004 + schema.prisma model matching what web expects
   (id, dossierId, symbol, title, storyJson, narrativeJson?, createdAt).

## Deliverables
1. Router: EDIT `src/dossier/analyzers.ts` classify() (or a new db-aware resolver in
   `src/dossier/job.ts` that passes sectorCode/industry into classify — choose the
   cleaner seam and justify) + tests. The dossier job must pass the resolved key so
   a live run logs `analyzer: semis` for MU.
2. Story build stage: EDIT `src/dossier/runner.ts` (add optional `buildStory` dep
   fired after memo; stage name `story`; skip-if-done like other stages) + wire the
   real builder in `src/dossier/job.ts`: scenario presets from judge targets + dcf
   tool output when present; statTape from fundamentals/technicals evidence;
   cycleStrip from analyzer + relative-rank percentile; frozen chart series from
   FundamentalsQuarter (revenue bars) + despiked Price (1y line); honest footnotes
   incl. data_status notes. Persist via a new `saveStoryPage` in src/db/queries.ts.
3. Migration 0004 if the StoryPage table is missing (verify against web/lib/story-data.ts
   column expectations — read it, don't guess).
4. Backfill command: `npm run job -- story --dossier=<id>` (or --symbols=MU latest)
   building pages for already-completed dossiers. Run it for the completed MU dossier
   is the CEO's live verification (document the exact command in ## Result).
5. Tests: router mapping; story stage in runner (FakeProvider, story persisted);
   build inputs from a fixture DB; migration applies cleanly.
6. CLAUDE.md updates: src/dossier, src/story, prisma/migrations, scripts if touched.

## Hard constraints
Do NOT touch: web/**, scratch/agy/**, package.json/lock, TASKS.md, src/analyst/**,
src/config/providers.ts|settings.ts, src/rules/**, src/capture/**, src/research/**,
src/jobs/** except registry-live.ts job registration. prisma additive-only.
No live network/LLM in vitest. Do NOT commit. The scheduler daemon is RUNNING —
do not stop it, do not run live jobs yourself.

## Gates
`npm run verify` green · `npm run job -- --list` shows `story`.

## Wrap-up
Append `## Result` with the CEO's live commands. Do NOT commit.
