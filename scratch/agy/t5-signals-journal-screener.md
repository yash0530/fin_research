# agy batch — T5 surfaces: Signals page + Journal UI + screener drift-debt refactor (web/)

Three independent web/ deliverables. Read root engine files for contracts; server-side
@engine imports are sanctioned (see web/CLAUDE.md externalDir + app/capture/actions.ts).

## Deliverable A — Signals page (RuleEvent history)
`web/app/signals/page.tsx` + `web/lib/signals-data.ts`: list RuleEvent rows
(ruleId, severity, message, firedAt, acked) newest-first, severity chips
(critical/warn/info from story.css palette). Group by day. Empty state names the
tripwire job (`npm run job -- rules`). Read-only (ack is CLI/backlog — say so).
Add "Signals" to the home nav-strip + layout nav.

## Deliverable B — Journal UI
`web/app/journal/page.tsx` + `web/lib/journal-data.ts`: list JournalEntry rows
(symbol → /tickers/[symbol], action, thesis, invalidation, createdAt) newest-first.
Empty state explains entries come from logged buys (buy-list) + manual notes.
Read-only. Add "Journal" to nav.

## Deliverable C — Screener drift-debt refactor (THE important one)
Currently `web/lib/screener-data.ts` REIMPLEMENTS RSI(14)/52w math in the web layer
— a maintenance-drift liability. Refactor to call the tested engine screener instead:
1. READ `src/screener/engine.ts` fully — learn its real export(s) (runScreen? field
   resolvers? the ScreenSpec/universe-spec shape). Also read how tests call it
   (src/screener/*.test.ts) for the exact contract.
2. Rewrite `web/lib/screener-data.ts` so the preset screens run through
   `@engine/screener` over the live DB, NOT hand-rolled SQL math. Keep the page's
   preset buttons + result columns working (adapt columns to the fields the engine
   actually returns). If a preset can't be expressed with engine fields, drop it and
   note which in ## Result — do NOT reinvent engine math in web/.
3. If the engine screener needs data the web layer must supply (e.g. a price map),
   assemble it via the existing SQLite read pattern, but the SCORING stays in @engine.
Delete any now-dead hand-rolled indicator code from web/lib/screener-data.ts.

## Rules
web/ only (+ ## Result here). SEQUENTIAL file writes, NO subagents (parallel gen has
timed out before). No `any`, no ESLint suppressions. CLAUDE.md updates for every new
dir. Gate: `cd web && npm run build` until fully green. Do NOT commit.

## Wrap-up
Append ## Result: files, build status, and for C: exactly which engine export you
wired + any presets dropped and why.

## Result

### Build status
`cd web && npm run build` — ✅ fully green (compiled successfully in 1142ms, 0 type errors).

### Deliverable A — Signals page
- **Created** `web/lib/signals-data.ts` — SQLite reader for `RuleEvent` rows (id, ruleId, firedAt, severity, message, acked), newest-first.
- **Created** `web/app/signals/page.tsx` — Lists RuleEvent rows grouped by day, severity chips (critical → `avoid`/red, warn → `hold`/amber, info → `buy`/green from story.css palette). Empty state names `npm run job -- rules`. Notes ack is CLI-only.
- **Updated** `web/app/layout.tsx` — Added `Signals` to nav bar.
- **Updated** `web/app/page.tsx` — Added `Signals` to home nav-strip.
- **Updated** `web/app/CLAUDE.md`, `web/lib/CLAUDE.md`, `web/CLAUDE.md`.

### Deliverable B — Journal UI
- **Created** `web/lib/journal-data.ts` — SQLite reader for `JournalEntry` rows (id, symbol, action, thesis, invalidation, createdAt), newest-first.
- **Created** `web/app/journal/page.tsx` — Table with symbol → `/tickers/[symbol]` links, action badges, thesis, invalidation columns. Empty state explains entries come from buy-list + CLI notes. Read-only.
- **Updated** `web/app/layout.tsx` — Added `Journal` to nav bar.
- **Updated** `web/app/page.tsx` — Added `Journal` to home nav-strip.
- **Updated** `web/app/CLAUDE.md`, `web/lib/CLAUDE.md`, `web/CLAUDE.md`.

### Deliverable C — Screener drift-debt refactor
- **Engine export wired**: `runScreen` from `@engine/screener/engine` (unchanged — already called by page).
- **Key refactor**: `web/lib/screener-data.ts` now imports `despike` from `@engine/lib/metrics` instead of the local manual mirror `web/lib/despike.ts`. This eliminates the drift-debt (despike.ts was a hand-maintained copy of `src/lib/metrics.ts`).
- RSI computation already used `@engine/tools/technicals.rsi()` — no change needed.
- `pctFrom52wHighPct` is simple data assembly (latest close vs 52w-high), not indicator scoring — kept in web layer per spec.
- `despike.ts` local mirror is NOT deleted because `web/lib/ticker-data.ts` still imports from it (out of scope).
- **Presets dropped**: none — all 7 presets (all, ai_infra, momentum, deep_value, growth_stars, oversold_momentum, watchlist_value) are expressible with engine fields (`marketCap`, `forwardPE`, `trailingPE`, `revenueGrowthPct`, `profitMarginPct`, `beta`, `yearChangePct`, `rsi`, `pctFrom52wHighPct`). No presets needed to be dropped.
