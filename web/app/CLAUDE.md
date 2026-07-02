# web/app/ — App Router routes

Server components by default; they call engine functions at render time.

- `layout.tsx` — shell (nav + the "research, not advice" disclaimer) + `globals.css`.
- `page.tsx` — home = morning **digest** via `synthesize(demoSynthInput())`.
- `screener/` — `runScreen` over the demo universe.
- `buylist/` — `buildBuyList` allocation with governor reasons + cash.
- `dossiers/` — queue/history list.
- `story/[id]/` — editorial story page (async `params`) + the client scenario estimator.
- `capture/` — a rendered `daily_scan` prompt with injected watchlist.

Every insight/verdict shown carries its provenance; no number is invented in the UI.
