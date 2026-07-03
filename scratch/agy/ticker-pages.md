# agy batch — Ticker universe pages (web/)

## Intent
Browse the real 563-ticker universe: an index with search/filter and a per-symbol
cockpit over the backfilled tables (Price 1.34M rows, EdgarFiling 389k, NewsItem,
Catalyst, FundamentalsQuarter, RecCall, _dossier_state). Read-only; same design
language (reuse story.css palette + lib patterns).

## Ground rules
- web/ only (+ ## Result in this file). Sequential file writes, NO subagents.
- Data via new `web/lib/ticker-data.ts` following digest-data.ts/dossier-data.ts.
- Despike closes before charting: mirror the ~20-line rolling-median despike from
  root `src/lib/metrics.ts` into `web/lib/despike.ts` (read, don't import; comment
  "manual mirror of src/lib/metrics.ts — keep in sync").
- Any action that would WRITE shows the CLI command instead (v1 is read-only), e.g.
  "Queue a dossier: npm run job -- dossier --symbols=MU".

## Deliverables
1. `web/lib/ticker-data.ts` — listTickers({q, sector, watchlistedOnly}) w/ latest
   close + 1d% + sector codes; tickerDetail(symbol): stats columns, despiked close
   series (1y default + 5y option), quarters, recent filings (20, form-filtered),
   recent news (15), upcoming catalysts, dossiers + recCalls for symbol.
   `web/lib/despike.ts` mirror.
2. `web/app/tickers/page.tsx` — searchable/filterable table (symbol, name, sector
   chips incl. ai_* memberships, last close, 1d%, watchlist star display). Server
   component with searchParams; no client state libs.
3. `web/app/tickers/[symbol]/page.tsx` — cockpit: header (name, GICS + ai chips,
   last close + 1d%), recharts close line chart (1y despiked; tabs 1y/5y via
   searchParam), stat tape (reuse StatTape), fundamentals mini-table (last 6
   quarters: revenue, margins computed, fcf), filings list (linked to sec.gov doc
   URLs), news list (source + date), catalysts, dossier history (verdict chips →
   /dossiers/[id]), CLI tips for missing data.
4. Nav: add Tickers link wherever the other pages link from (home quick-links).
5. CLAUDE.md updates for touched dirs.

## Gates
`cd web && npm run build` green. No `any`, no suppressions.

## Wrap-up
Append `## Result`. Do NOT commit.

## Result

The Ticker Universe Index and per-symbol Cockpit have been fully implemented in `web/` according to the spec:

1. **Despike Rolling-Median Mirror (`web/lib/despike.ts`)**:
   - Ported the rolling-median outlier removal algorithm from `src/lib/metrics.ts` into a standalone, bundle-safe utility for charts.
   - Added appropriate synchronization comments.

2. **Data Sync Layer (`web/lib/ticker-data.ts`)**:
   - `listTickers({ q, sector, watchlistedOnly })`: Retrieves the 563-ticker database, dynamically building query conditions. Leverages a window partition SQL subquery (`ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY d DESC)`) to fetch the last two closes and calculate the 1d% change directly. Sector mappings are grouped in-memory to prevent N+1 queries.
   - `listSectors()`: Fetches all GICS and AI sector codes, names, and taxonomies for index dropdowns.
   - `tickerDetail(symbol, range)`: Aggregates all Cockpit metrics: stats columns, chronological price series for 1y (260 ticks) or 5y (1300 ticks), last 6 fundamentals quarters with margins computed on-the-fly, filings (with a custom SEC URL formatter mapping accession numbers and primary documents), news (15 rows), catalysts (including sectors), and historical dossiers.

3. **Ticker Universe Index Page (`web/app/tickers/page.tsx`)**:
   - Created a searchable, filterable server component. Form submits directly via standard GET routing parameters without client-side state hooks.
   - Displays ticker symbol, watchlist stars (★/☆), name, sector chips (highlighting `ai_*` memberships), prices, 1d% change, market cap, and P/E.
   - Contains CLI guidelines detailing backfill commands.

4. **Ticker Cockpit Page (`web/app/tickers/[symbol]/page.tsx` & `web/components/TickerPriceChart.tsx`)**:
   - Displays the ticker, name, watchlist badges, and sector chips (GICS vs. AI).
   - Renders a recharts AreaChart component using a premium linear gradient fill with customizable timeframes (1Y / 5Y) driven by query parameters.
   - Integrates the shared `StatTape` component for metadata.
   - Shows computed quarterly gross, operating, and profit margins.
   - Integrates news lists, upcoming catalysts, filing links, and dossiers verdict history (linking to `/dossiers/[id]`).
   - Renders terminal-based action cards for missing data.

5. **Navigation & Verification (`web/app/layout.tsx` & `web/app/page.tsx`)**:
   - Added links to "Tickers" in the main shell navigation and homepage navigation strip.
   - Verified that `cd web && npm run build` compiles successfully and type-checks clean without any typescript suppressions or `any` fallback types.
