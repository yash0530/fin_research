# web/app/ — App Router routes

Server components by default; they call engine functions at render time.

- `layout.tsx` — shell (nav + the "research, not advice" disclaimer) + `globals.css`.
- `page.tsx` — home = morning read dashboard from SQLite DB (`latestDigest()`) grouped by family with severity chips, or empty state instructions.
- `digest/[d]/` — past digest page by date (identically rendered, force-dynamic).
- `screener/` — `runScreen` over the demo universe.
- `buylist/` — monthly allocation page reading from BuyList/BuyListItem tables with fallback candidate preview.
- `calibration/` — conviction tiers summary w/ governor status and recommendation/calibration log.
- `dossiers/` — list/queue of real dossiers from SQLite DB with verdict, governed size, timing details, and wall clock.
- `dossiers/[id]/` — dossier detail page with stage timeline, investment verdict card, debate accordion (bull, bear, rebuttal, critique), and tool evidence table.
- `signals/` — read-only RuleEvent history page grouped by day with severity chips (critical/warn/info). Empty state names the tripwire job (`npm run job -- rules`).
- `journal/` — read-only JournalEntry list page with symbol links, action badges, thesis, and invalidation columns. Empty state explains provenance (buy-list + CLI notes).
- `story/[id]/` — editorial story page (async `params`) + the client scenario estimator.
- `capture/` — a rendered `daily_scan` prompt with injected watchlist.
- `live/` — **live** digest read from the SQLite DB at request time (force-dynamic) via the
  tested data layer; the pattern for wiring the rest of the pages to real data.

Every insight/verdict shown carries its provenance; no number is invented in the UI.
