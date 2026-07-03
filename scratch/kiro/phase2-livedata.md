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

## Result

Live data layer implemented. `npm run verify` is green (typecheck clean, **296 tests
pass across 47 files**, `✓ CLAUDE.md present in all 42 directories`) and
`npm run job -- --list` prints the 9-job registry with no DB/network. Nothing committed.

### Files

New:
- `src/net/yahoo2.ts` (+ `yahoo2.test.ts`) — yahoo-finance2 thin adapter: `fetchDailyBars`,
  `fetchQuoteBatch` (≤100/call, chunked), `fetchQuarterlyFundamentals`, `fetchTickerStats`,
  `fetchEarningsDates`; pure mappers + `mapPool`; silent injected client; never-throw.
- `src/net/route.ts` (+ `route.test.ts`) — `routeDailyBars` (yahoo2 → staggered Stooq CSV
  fallback), `parseStooqCsv` / `fetchStooqDaily` / `stooqUrl`; every row carries `source`.
- `src/jobs/stats.ts`, `src/jobs/news.ts`, `src/jobs/earnings.ts`, `src/jobs/overnight.ts`.
- `src/jobs/backfill-tasks.test.ts`, `src/jobs/jobs.test.ts`.
- `scripts/job.ts` — the job CLI (`--list`, `--symbols=`).

Modified (allowed): `src/jobs/backfill.ts` (+`runBackfillPool` + live-wired `backfillPrices10y`
/`backfillFundamentals`/`backfillEdgarIndex` + `parseCompanyTickers`), `src/db/queries.ts`
(BackfillProgress / fundamentals / edgar / ticker-stats / news / catalyst / job-run /
selector helpers), `scripts/seed.ts` (sample digest now create-if-absent),
`src/net/CLAUDE.md`, `src/jobs/CLAUDE.md`, `scripts/CLAUDE.md`.

Do-NOT-touch list respected: no changes to `package.json`/lock, `TASKS.md`, `src/analyst/**`,
`src/dossier/**`, `src/config/providers.ts`, `src/config/settings.ts`, `web/**`, `prisma/**`,
`src/rules/**`, `src/capture/**`; `src/research/synthesize.ts` is only *called* (by the digest
job), never edited. All vitest tests are network-free (fake clients / injected fetchers).

### Test delta

+43 tests in 4 new files: `yahoo2.test.ts` (12 — mappers, `mapPool`, every wrapper's
`[]/null`+error path), `route.test.ts` (9 — Stooq parse, never-throw, route win/fallback/
window/both-empty), `backfill-tasks.test.ts` (7 — pooled resumability+catch-per-item,
prices/fundamentals/edgar writes + progress, `parseCompanyTickers`, period1 math),
`jobs.test.ts` (15 — stats COALESCE/never-crash, news RSS parse+dedupe+catch-per-query,
earnings upsert dedupe, overnight order + failure-resilience + one-JobRun-per-step,
prices-heal, digest).

### Live-run playbook (CEO)

Prereqs (once): set `DATABASE_URL` (default `file:./data/engine.db`) and
`EDGAR_USER_AGENT="Your Name you@example.com"` (SEC requires it for `edgar_index`), then
`npm install && npm run seed` (populates sectors + the S&P/AI-infra universe).

One-time backfills — all **resumable** (safe to Ctrl-C and re-run; done symbols are
skipped) and **catch-per-item** (a single 429/miss never aborts the run):

```bash
npm run job -- edgar_index    # SEC CIK map → Ticker.cik, then submissions → EdgarFiling
npm run job -- prices10y      # ~10y daily bars → Price   (yahoo2 → Stooq fallback)
npm run job -- fundamentals   # quarterly statements → FundamentalsQuarter
```

Expected, for the seeded universe (~700–800 active symbols):
- `edgar_index`: ~2–4 min (shared 8 req/s EDGAR limiter; 1 submissions call/symbol; plus
  one `company_tickers.json` fetch). ~10–40 filings/symbol kept (10-K/10-Q/8-K/4/DEF 14A).
- `prices10y`: ~10–18 min (conc 2, 1200 ms stagger). ~2,000–2,500 bars/symbol →
  ~1.5–2.0 M Price rows total.
- `fundamentals`: ~10–18 min (conc 2, 1200 ms stagger). ~20–40 quarters/symbol.

Nightly (the morning-digest chain — one `JobRun` row per step, never-crash):

```bash
npm run job -- overnight      # prices-heal → stats → news → earnings → rules → digest
```

Expected: ~2–6 min end-to-end (prices-heal is a 5-day top-up at conc 6/300 ms; `stats`
batches quotes 100/req; `news` is a handful of RSS pulls; `rules` + `digest` are local).
Wire it to the existing scheduler / launchd agent for the daily cadence.

Ad-hoc / targeted:

```bash
npm run job -- stats
npm run job -- news
npm run job -- earnings
npm run job -- rules
npm run job -- digest
npm run job -- prices10y --symbols=MU,NVDA,AVGO    # restrict any job to a symbol subset
npm run job -- --list                               # the registry (offline)
```

Each run prints `[OK|FAIL] <job> (<secs>s)` + a summary and exits `0`/`1`
(`--list`/usage → `2`). Backfill progress persists in `BackfillProgress`, so re-running a
backfill after a partial run only fetches what's left.
