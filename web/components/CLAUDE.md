# web/components/ — shared UI

- `Sidebar.tsx` / `SidebarWatchlist.tsx` / `TickerJump.tsx` — the persistent
  240px shell nav (5 items), watchlist sparkline list, and `/`-key ticker jump.
- `CaptureToggle.tsx` / `CaptureDrawer.tsx` — the global paste-capture drawer
  (P4) mounted in `app/layout.tsx`; calls `parseAndSaveAction` from
  `app/capture-actions.ts`. This is the only surviving capture entry point —
  the old `/capture` page route is deleted.
- `run-ui.tsx` — **client**; shared on-demand-run bits: the `useRunStatus()` polling hook
  (polls `getRunStatusAction` from `app/actions.ts` every 3s; calls `router.refresh()`
  when a run finishes so server components pull fresh rows) + the `RunStatusPill`
  (idle/booting/running) + button style.
- `RunStatusBar.tsx` — **client**; sidebar-footer control bar: **Refresh digest** (boots
  model for narration) + **Refresh data** (no model) buttons, disabled while a run is in
  progress, with the live status pill. Calls `app/actions.ts` server actions.
- `SourcingInbox.tsx` — **client**; the `/` dashboard's Sourcing Inbox list
  (`Candidate` tier 1-2 rows with `+Watch`/`Archive` server actions) + a
  collapsed "killed by quality" tier-3 `Disclosure` log.
- `WelcomeBackBanner.tsx` — **client**; the `/` dashboard's 10+-idle-day banner,
  one click into `refreshDigestAction`.
- `CandleChart.tsx` — **client** component; pure SVG interactive multi-pane candle chart (price, volume, RSI, MACD, and event glyphs) with crosshair HUD and client-side RangeTabs.
- `CandleChart.fixtures.ts` — synthetic OHLCV fixtures and events for development.
- `WatchlistButton.tsx` — **client** component; updates candidate/watchlist state in DB.
- `InversionChecklistForm.tsx` — **client** component; records inversion checklist thesis and freezes computed payload JSON (ticker cockpit page).
- `ResearchRunDrawer.tsx` — **client** component; triggers background research runs asynchronously (ticker cockpit page).
- `ui/` — the design-system primitives (`Panel`, `Stat`/`StatStrip`, `DenseTable`,
  `TrendNumber`, `Badge`, `ScoreChip`, `BandBar`, `Sparkline`, `SectionNav`,
  `Disclosure`, `EmptyState`, `RangeTabs`, `TierTag`) — see its CLAUDE.md.
- `story/` — only `story.css` remains (see its CLAUDE.md); the editorial story
  components (`StoryHero`, `StatTape`, `CycleStrip`, `EvidenceChart`,
  `StoryEstimator`, `Callout`, `Footnotes`) were deleted with the `/story` route
  in P7.

## P7 removals

`InsightList.tsx` and `ScenarioEstimator.tsx` — both were single-purpose
components for the deleted `/` (old digest render) and `/story` pages and had
no remaining importers once those pages were rebuilt/removed.
`TickerPriceChart.tsx` — superseded by `CandleChart.tsx`, had zero importers.
