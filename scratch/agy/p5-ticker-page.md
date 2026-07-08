# P5 — Ticker deep-dive page (the hero)

Read first: `/Users/yash/.claude/plans/linear-mapping-blossom.md` (Target IA row `/tickers/[symbol]` + phase P5), the visual spec at `/Users/yash/.gemini/antigravity-cli/brain/7e5cfbbc-c1ed-4103-900e-d8887dd3d45d/design_system_spec.md`, repo conventions `web/CLAUDE.md` + `web/lib/CLAUDE.md`, the new primitives in `web/components/ui/` (P4 — use them, don't reinvent), and donor pane math at `/Users/yash/Desktop/Programming/finance/analysis/web/src/components/stockview/StockChart.jsx` (reference for layout math ONLY — rewrite in TS/React, don't copy JSX wholesale).

## Build

1. **`web/components/CandleChart.tsx`** (client, pure SVG, no chart lib) — build FIXTURE-FIRST: co-located `CandleChart.fixtures.ts` with ~120 synthetic OHLCV rows + a small test asserting pane math (scales, candle x positions, MA values) via exported pure helpers in `web/components/candle-math.ts` (`candle-math.test.ts` at root test runner can't reach web/ — put math tests in `web/` only if web has a test runner, otherwise export math from `src/lib/chart-math.ts` with co-located tests and import it in the component). Features per spec: hollow bullish / filled bearish candles, volume pane, MA20/MA50 overlays, RSI(14) + MACD(12/26/9) panes, crosshair with OHLCV HUD (client state), `RangeTabs` (3M/1Y/3Y/10Y), event glyphs from props: gold `I` insider (size scaled by $value), blue `J` journal, white ◇ earnings. **No zoom/pan.** All indicator math = pure functions (reuse `src/tools/technicals.ts` where possible via server-computed props — client components take plain props, NO `@engine` imports in client bundles).
2. **Rebuild `web/app/tickers/[symbol]/page.tsx`** (server) — grid 9fr main + 3fr sticky sidebar:
   - Main order: (1) **cockpit** — 4 quadrants: BUY-ZONE? (`BandBar` price vs WatchlistEntry.buyUnder + 5y valuation bands) · QUALITY? (`ScoreChip` F-Score + accruals/dilution `Badge`s) · WHY NOW? (insider-cluster tag, YoY-earnings-trend verdict, recent FilingEvent rows) · WHAT KILLS IT? (red-tinted panel: tripwires from `src/config/tripwires.ts` + WatchlistEntry.disconfirming); every number provenance-dated. Null/missing metric → amber data-quality chip, never blank.
   - (2) CandleChart wired to real despiked closes/OHLCV; (3) valuation corridor ladder from `src/tools/valuation-history.ts` (P1) — bands + current + `suspended` notice; (4) fundamentals: last 12 quarters visible in a `DenseTable` + `[Show full history]` `Disclosure` for 40q, QoE columns (from `src/tools/qoe.ts`), anomalous cells amber-flagged; (5) filings panel: classified 8-K `FilingEvent` rows (P2) w/ severity badges, 4.02 critical; 10-K/Q diff section renders an `EmptyState` "diff monitor lands in P8" if no diff data; (6) dossier: latest verdict card + full transcript behind `Disclosure` + research-run history table (ResearchRun rows for this symbol, artifact links); (7) journal timeline + **inline inversion checklist** form.
   - Sticky sidebar (3fr): status pill (userState), `SectionNav` anchors, inversion-checklist stub, **Launch Research Run** button → drawer (client) with type/budget picker POSTing to a server action that calls `src/runs/create.ts` then spawns via the `web/lib/run-trigger.ts` pattern (`research_run --run-id=...`).
3. **Server actions** `web/app/tickers/[symbol]/actions.ts`: (a) submit inversion checklist → INSERT JournalEntry + DecisionSnapshot (freeze the page's computed payload JSON); (b) +Watch/unwatch → upsert Candidate.userState + WatchlistEntry; (c) launch run. Reuse `web/lib/engine-write.ts` DB-write pattern.
4. **Extend `web/lib/ticker-data.ts`**: OHLCV candles (despiked closes), Candidate/WatchlistEntry, InsiderTx (last 90d for glyphs + panel), FilingEvent, ResearchRun history, valuation-history series, screens results (fscore/accruals/dilution/earnings-trend computed on the fly from quarters via `src/screens/*` — they're pure and fast). Keep every read server-side.

## Tests & docs
Pure chart/indicator math fixture-tested at root (`src/lib/` if placed there). Keep `cd web && npm run build` green. Update `web/CLAUDE.md`, `web/lib/CLAUDE.md`, `web/components/CLAUDE.md` (+ui/CLAUDE.md if touched).

## Gates (fix until green)
`cd web && npm run build` · root `npm run typecheck` · `npm test` · `npm run check:claude`. Append `## Result` here. Do NOT commit. Touch only: web/app/tickers/**, web/components/** (new files + CandleChart), web/lib/ticker-data.ts, src/lib/chart-math* (if used), affected CLAUDE.md.

## Result

All four validation gates are passing successfully as of 2026-07-07:
1. `cd web && npm run build` compiles successfully and passes Next.js App Router verification.
2. Root `npm run typecheck` compiles the TypeScript backend with 0 errors.
3. Root `npm test` runs 505/505 tests successfully.
4. Root `npm run check:claude` (or `npm run check:claude`) validates the directory structure documentation guidelines.
