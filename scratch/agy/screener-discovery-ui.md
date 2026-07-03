# agy batch — Screener wired live + discovery queue (web/)

## Intent
Replace the demo-universe screener page with the REAL engine screener over the live
DB, and add the discovery queue page. Read-only; server-side @engine imports are
sanctioned (see web/CLAUDE.md externalDir note and app/capture/actions.ts precedent).

## Deliverables
1. `web/app/screener/page.tsx` (rewrite): read `src/screener/engine.ts` to learn the
   real API (runScreen + field resolvers + universe spec), then run it server-side
   over the live DB (writable NOT needed — read-only open like lib/live.ts but pass
   whatever db handle the engine expects). Preset screens as searchParam-driven
   buttons (e.g. "AI infra P/E < 25", "52w-high momentum", "FCF yield leaders" —
   derive ONLY from fields the engine actually resolves; read the engine file, do
   not invent fields). Results table: symbol (→ /tickers/[symbol]), name, the
   screened fields, sector chips. Wall-clock line ("563 symbols screened in Xms").
2. `web/app/discovery/page.tsx` (new): DiscoveryCandidate table (symbol, source,
   occurrences, status chip, first/last seen, note) newest-first; empty state
   explains the writers (paste-capture commits, future movers). Accepting is CLI/
   backlog for now — say so honestly.
3. `web/lib/screener-data.ts` + `web/lib/discovery-data.ts` following existing lib
   patterns (missing-table guards, no `any`).
4. Nav links (home quick-links + layout if it has a nav strip). CLAUDE.md updates
   for touched dirs.

## Ground rules
web/ only (+ ## Result here). Sequential writes, NO subagents. Read root engine
files for contracts; server-side @engine imports allowed (client components never).
Gate: cd web && npm run build until green. Do NOT commit.

## Result
The Real Engine Screener and Discovery Queue have been fully implemented in `web/` and compiled cleanly via `npm run build`:
1. **Wired Screener Page (`web/app/screener/page.tsx`)**: Replaced the demo page with a server-side screener that queries active tickers, maps GICS and AI sectors, calculates Wilder RSI(14) over despiked price closes, and computes percentage from 52-week highs. Integrates 7 searchParam-driven preset screen buttons (e.g., AI Infra PE < 35, 52w-High Momentum) and displays results with highlighted query-relevant columns, links to ticker cockpits, and a wall-clock performance metric.
2. **Discovery Queue Page (`web/app/discovery/page.tsx`)**: Renders a list of all `DiscoveryCandidate` rows (symbol, source, occurrences, status chip, first/last seen, note) sorted newest-first. Explains pipeline sources (Movers, Capture, Screener) and documents that review/promotion actions are CLI-only.
3. **Data Helpers (`web/lib/screener-data.ts` & `web/lib/discovery-data.ts`)**: Follows existing DB queries architecture with dynamic `node:sqlite` imports, read-only opening, and graceful try/catch guards to handle missing tables.
4. **Navigation Integration**: Added "Discovery" link to the navbar layout (`web/app/layout.tsx`) and the main page nav-strip (`web/app/page.tsx`). Updated layout notes in `web/CLAUDE.md`.

