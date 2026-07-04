# agy batch M3-D.2 — /portfolio UI (positions + decay + wwcm checklist)

## Why
Surface the D.1 thesis-decay engine: a positions view with P&L, the mechanical decay
signals, and — per held name — its latest dossier verdict + the free-text
`what_would_change_mind` conditions as a MANUAL monitoring checklist (these can't be
auto-evaluated; the human checks them). Plus a write path to add/edit/remove positions
(the app's second write surface after capture).

## Read first (patterns to match)
- `web/app/capture/actions.ts` + `web/lib/engine-write.ts` — the server-action + writable-
  DB pattern (this is your write-path template).
- `web/lib/calibration-data.ts` / `web/lib/dossier-data.ts` — the read-layer pattern
  (dynamic node:sqlite, missing-table guards, no `any`).
- `@engine/portfolio/decay` — `decaySignals`, `positionView`, types. Call these
  server-side (sanctioned @engine import, like capture). Do NOT reimplement decay logic.
- Root `src/db/queries.ts` — `listPositions`, `upsertPosition`, `deletePosition`,
  `latestCloseFor`, `latestRecCallFor` (built in D.1). The RecCall `wwcmJson` column may
  be null; the dossier's what_would_change_mind also lives in the dossier verdictJson /
  `_dossier_state` — read whichever is populated (check both; guard nulls).
- `web/app/layout.tsx` nav array + `web/app/page.tsx` nav-strip.

## Deliverables
1. `web/lib/portfolio-data.ts`: `loadPortfolio()` → for each Position: qty, avgCost,
   currentPrice, marketValue, pnlPct (via `@engine/portfolio/decay.positionView`), the
   `decaySignals(...)` findings (load closes + latest RecCall server-side to feed it),
   and the latest verdict summary (action, conviction, governedSizePct, stopPrice,
   targetLow/High, and the what_would_change_mind string list if available). Missing-table
   safe.
2. `web/app/portfolio/page.tsx`: positions table (symbol→/tickers/[symbol], qty, avg cost,
   last, mkt value, P&L% colored, decay chips: stop_breach=critical/red,
   drawdown=warn/amber, target/below_cost=info). Portfolio totals (cost basis, market
   value, total P&L). Per row (or an expandable/detail section): the latest dossier
   verdict card + the `what_would_change_mind` list rendered as a checklist ("Monitor:"
   with each condition) + a link to the dossier. Empty state explains adding a position.
3. `web/app/portfolio/actions.ts` (server actions over @engine + openWritableDb):
   `addOrUpdatePositionAction(symbol, qty, avgCost, openedAt?)` and
   `removePositionAction(symbol)` → upsertPosition/deletePosition; revalidate /portfolio.
   A small client form component `PositionForm.tsx` (add/edit) + a remove button.
4. Nav: add "Portfolio" to layout nav + home nav-strip. CLAUDE.md for the new dir(s).

## Design
Reuse `story.css` palette/classes (severity chips already exist). No `any`, no ESLint
suppressions. The wwcm checklist is display-only (visual checkboxes are fine; no
persistence needed).

## Hard constraints
web/ ONLY (+ this spec's ## Result). SEQUENTIAL writes, no subagents. Gate:
`cd web && npm run build` until green. Do NOT commit.

## Wrap-up
Append `## Result`: files, build status, and note the demo positions (MU, SNDK) the CEO
seeded so the page renders with data (CEO will clear them before handoff).
