# web/app/ — App Router routes

Server components by default; they call engine functions at render time. Five
routes (P7 target IA) plus the ticker cockpit's dynamic segment:

- `layout.tsx` — shell (`Sidebar` + `CaptureDrawer`) + `globals.css`.
- `page.tsx` — `/` **Action Center**: welcome-back banner (10+ idle days since
  the latest JobRun/Digest, offers a one-click digest run), a header micro-strip
  (portfolio value/P&L, this month's buy-ceremony capital, per-tier governor cap
  status), then `.dashboard-grid`: **Sourcing Inbox** (deduped `Candidate`
  `userState=INBOX` tier-1/2 rows with `+Watch`/`Archive` actions + a collapsed
  "killed by quality" tier-3 log), **Action Queue** (watchlist buy-band
  proximity), **Tripwire & Decay Alerts** + **Catalysts (7d)**, **Digest
  Insights**, **Calibration** tier strip, **Portfolio Snapshot**. Data via
  `@/lib/dashboard-data`.
- `actions.ts` — **`"use server"`**: `refreshDigestAction()`/`refreshDataAction()`
  (on-demand jobs, unchanged) + `getRunStatusAction()` (the shared poll endpoint
  `components/run-ui.tsx` calls everywhere — moved here from the deleted
  `app/dossiers/actions.ts`) + `watchCandidateAction`/`archiveCandidateAction`
  (Sourcing Inbox row actions).
- `portfolio/` — held positions, watchlist valuation bands, the 4-step monthly
  buy-ceremony wizard (see its CLAUDE.md).
- `journal/` — entry log with frozen `DecisionSnapshot` rendering, editor,
  post-trade outcomes, mistake taxonomy, quarterly review board, and the
  calibration/governor console (moved here from the deleted `/calibration`
  page — see its CLAUDE.md).
- `themes/`, `themes/[code]/` — theme intelligence pages (unchanged, P6).
- `tickers/[symbol]/` — the ticker cockpit hero page + its server actions
  (unchanged, P5). No `tickers/page.tsx` index — the sidebar `/`-key search and
  watchlist replace it.
- `capture-actions.ts` — **`"use server"`**: `parseAndSaveAction` for the global
  `CaptureDrawer` (P4) — the only surviving capture entry point; the old
  `/capture` page route is deleted.

## Deleted routes (P7)

`screener`, `discovery`, `signals`, `memos`, `calibration`, `buylist`, `capture`,
`story`, `live`, `digest`, `dossiers`, and the `tickers` index — all engine
modules stay under `src/`; only the page shells and their page-only readers are
gone. `web/next.config.ts` `redirects()` sends every old path somewhere live
(`/calibration`→`/journal`, `/buylist`→`/portfolio`, everything else →`/`).

Every insight/verdict shown carries its provenance; no number is invented in the UI.
