# Kiro batch C — Live data layer: yahoo-finance2 transport, jobs, overnight chain (NEXT_RUN Phase 2)

## Context (verified facts — do not re-litigate)
- Naive Yahoo fetch is 429-throttled from this IP (verified Jul 2). DECISION (docs/research/market-scan.md): **yahoo-finance2 is the Yahoo transport**. It is ALREADY INSTALLED (v3.15.4) and `npm run job` → `tsx scripts/job.ts` is already wired in package.json — do NOT touch package.json.
- Existing hand-rolled parsers/fetchers in `src/net/` stay as tested fallback mappers.
- EDGAR: `src/net/edgar.ts` + 8 req/s limiter exist and are tested; submissions JSON ≈ 10y coverage (verified: MU 1,004 filings 2017→2026).
- `RuleEvent` migration exists (0002). Jobs runner (`src/jobs/runner.ts`, never-crash) and resumable backfill orchestration (`src/jobs/backfill.ts`, BackfillProgress) exist.
- All vitest tests MUST stay network-free (fixtures/mocks only). Live runs are the CEO's job after this batch.

## Deliverables (ONLY these files)
1. NEW `src/net/yahoo2.ts` (+ `yahoo2.test.ts`, mocked module): thin adapter over yahoo-finance2 —
   `fetchDailyBars(symbol, period1)` (chart), `fetchQuoteBatch(symbols[])` (quote, ≤100/call),
   `fetchQuarterlyFundamentals(symbol)` (fundamentalsTimeSeries quarterly),
   `fetchTickerStats(symbol)` (quoteSummary: defaultKeyStatistics/financialData/summaryDetail),
   `fetchEarningsDates(symbol)` (calendarEvents). Each maps to OUR row types, tags
   `source: "yahoo2"`, never throws (null/[] + error string), suppresses yahoo-finance2's
   schema-validation noise. Bounded concurrency helper reused from existing net code or a
   small mapPool here.
2. NEW `src/net/route.ts` (+ test): provider chain for daily bars — yahoo2 → Stooq CSV
   fallback (`https://stooq.com/q/d/l/?s={sym.lower}.us&i=d`, gentle ≥2s stagger,
   source:"stooq"); stats/fundamentals are yahoo2-only. Every returned row carries `source`.
3. Backfill tasks wired to live fetchers in `src/jobs/backfill.ts` (+ tests with mocked fetchers):
   - `prices10y`: bars since today−3660d per symbol, conc 2 / stagger 1200ms, chunked
     `INSERT OR IGNORE` (500-row txns) into Price, BackfillProgress per symbol.
   - `fundamentals`: quarterly per symbol → FundamentalsQuarter (same discipline).
   - `edgar_index`: CIK map from company_tickers.json once → Ticker.cik; submissions per
     symbol → EdgarFiling rows (10-K/10-Q/8-K/4/DEF 14A). Uses existing edgar limiter.
4. NEW jobs (each registered, never-crash, catch-per-item; files `src/jobs/{stats,news,earnings}.ts` + tests):
   - `stats`: batched quote() over active tickers (100/req) → Ticker stat columns.
   - `news`: Google News RSS per AI-infra sector `newsQuery` + watchlisted symbols —
     port `ResearchEngine/lib/jobs/news.ts` semantics using fetch + fast-xml-parser
     (NO new deps); urlHash dedupe into NewsItem.
   - `earnings`: fetchEarningsDates over watchlist + AI-infra symbols → Catalyst upserts.
5. `overnight` chain in `src/jobs/overnight.ts` (+ order/failure-resilience test):
   prices-heal (chart 5d per symbol, conc 6/300ms) → stats → news → earnings → rules
   (runAllRules) → digest (synthesize + persist via queries). One JobRun row per job.
6. NEW `scripts/job.ts`: CLI — `npm run job -- <name> [--task=... --symbols=A,B]` runs any
   registered job against DATABASE_URL; prints per-job summary + exit code. `--list` lists jobs.
7. `scripts/seed.ts`: sample digest becomes create-if-absent (fixes digest-count growth nit).
8. CLAUDE.md updates: `src/net`, `src/jobs`, `scripts` module maps.

## Hard constraints
- Do NOT touch: package.json/package-lock, `TASKS.md`, `src/analyst/**`, `src/dossier/**`,
  `src/config/providers.ts`, `src/config/settings.ts`, `web/**`, `prisma/**`,
  `src/rules/**`, `src/capture/**`, `src/research/synthesize.ts` beyond calling its
  existing API from the digest job.
- No live network in vitest. Never-throw discipline. YYYY-MM-DD market dates.
- Do NOT commit.

## Gates
- `npm run verify` green.
- `npm run job -- --list` prints the registry (no network).

## Wrap-up
Append `## Result`: files, test delta, and a short "live-run playbook" (exact commands
the CEO runs for backfill + overnight, expected durations/row counts). Do NOT commit.
