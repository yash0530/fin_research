# agy batch — Calibration + buy-list surfaces (web/)

## Intent
Read-only pages for the capital discipline layer. A real RecCall row now exists
(MU AVOID/LOW governed 0%). Follow web/lib patterns + story.css design language.

## Deliverables
1. `web/lib/calibration-data.ts`: listRecCalls() (all fields incl. outcomes),
   tierSummary() — per conviction tier: total calls, resolved (any outcome non-null),
   favorable rate (BUY: outcome>0; TRIM/AVOID: outcome<0; HOLD: |x|<=2.5 — mirror
   src/calibration semantics, read the file, comment the mirror), governor status
   line ("HIGH: 0/5 resolved — cap 2%" style; thresholds: 5 resolved, >=50%
   favorable, 2% cap — from src/calibration/governor.ts).
2. `web/app/calibration/page.tsx`: tier table w/ governor status; calls table
   (symbol → /tickers/[symbol], dossier link, action/conviction chips, price at
   call, targets, judge→governed size + reason, outcome columns with pending
   states); explainer block (the sizing-trust philosophy, 3 sentences max).
3. `web/app/buylist/page.tsx` (upgrade the placeholder): reads BuyList/BuyListItem
   tables when present; while empty, show the ritual explainer + a live
   "candidates preview" (RecCalls with action=BUY within 45 days, governed size,
   note that a buy-list job is coming) + CLI tip. Check the actual table names/
   columns in prisma/schema.prisma first (read it) — if BuyList tables don't exist
   in the DB, the page must not crash (missing-table guard like other libs).
4. Nav links from home. CLAUDE.md updates.

## Ground rules
web/ only (+ ## Result here). Sequential writes, no subagents. Read root files for
shapes; never import them. Gate: cd web && npm run build. No `any`. Do NOT commit.

## Result
Fully implemented the calibration and buy-list features within `web/` using zero subagents, sequential writes, and no direct imports from root source files.

1. **`web/lib/calibration-data.ts`**: Implemented `listRecCalls()` and `tierSummary()`. Favorable rate calculation handles BUY, TRIM/AVOID/SELL, and HOLD convictions correctly (mirroring `src/calibration/governor.ts` semantics). Employs safe, dynamic SQLite table reading with error logging/fallback.
2. **`web/lib/buylist-data.ts`**: Created for fetching `BuyList`/`BuyListItem` structures safely from SQLite with a fallback to a 45-day `RecCall` (BUY action) candidates preview.
3. **`web/app/calibration/page.tsx`**: Implemented the conviction tiers table w/ governor status line, recommendation/calibration log table, and the sizing-trust philosophy explainer block (3 sentences max). Uses `story.css` class designs.
4. **`web/app/buylist/page.tsx`**: Upgraded from placeholder to read and show actual `BuyList` and `BuyListItem` rows when populated. When empty, it falls back to showing the monthly ritual explainer, candidates preview, and CLI tip.
5. **Nav & CLAUDE.md Updates**: Added Calibration links to root navigation `layout.tsx` and homepage `page.tsx` nav-strip. Documented new routes/libs in both `web/app/CLAUDE.md` and `web/lib/CLAUDE.md`.
6. **Gate check**: Ran `cd web && npm run build` successfully with no type-checking or bundling errors. No `any` type was used throughout the changes. No commits were made.
