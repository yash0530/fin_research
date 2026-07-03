# src/jobs/ — job orchestration

The control-flow that must be correct regardless of what the live fetchers do. Pure over
injected dependencies → fully tested with fakes (no network).

## Files

- `runner.ts`
  - `runJob(name, fn, record?)` — the **jobs-never-crash** wrapper: a thrown error becomes
    `{ok:false, detail}`, never propagates. `record` persists a JobRun row in the app.
  - `runChain(steps, record?)` — runs steps in order; a **failed step never aborts** the
    chain (failures are counted). This is the overnight pipeline shape
    (prices→news→earnings→…→digest).
- `backfill.ts`
  - `runBackfill(deps)` — generic **resumable** (skip `isDone` symbols) + **catch-per-item**
    orchestrator. Live Yahoo/EDGAR fetchers plug into `fetchOne`; persistence into
    `write`/`markDone`/`markError`; `onEach` for rate-limit pauses. Returns
    `{done, errors, skipped, rows}`.
  - `runBackfillPool(deps)` — the same invariants with N workers draining a shared queue
    + an optional per-item stagger (bounded concurrency for throughput while staying polite).
  - Live-wired tasks (fetchers injected, built in `scripts/job.ts`): `backfillPrices10y`
    (bars since today−3660d → Price, chunked 500-row txns, conc 2/1200ms),
    `backfillFundamentals` (quarterly → FundamentalsQuarter), `backfillEdgarIndex`
    (`parseCompanyTickers` → Ticker.cik, then submissions → EdgarFiling). Each records
    BackfillProgress per symbol.
- `stats.ts` — `runStatsJob`: batched yahoo2 quote() over active tickers → Ticker stat
  columns (COALESCE keeps prior values on a transient null). Never-crash, catch-per-item.
- `news.ts` — `runNewsJob`: Google News RSS per query (`googleNewsUrl`) → `parseNewsRss`
  (fast-xml-parser, pure) → NewsItem deduped by `urlHash`. Catch-per-query.
- `earnings.ts` — `runEarningsJob`: yahoo2 earnings dates → `earnings` Catalyst upserts,
  deduped by (kind, symbol, d). Catch-per-item.
- `overnight.ts` — the morning chain `prices-heal → stats → news → earnings → rules →
  digest` as a `runChain` (one JobRun row per step). `runPricesHealJob` (5-day chart
  top-up, conc 6/300ms) and `runDigestJob` (assemble a deterministic SynthInput from the
  DB → `synthesize` → `saveDigest`) are the two overnight-only step builders.

## Tests

`backfill.test.ts` — job success/failure capture, chain-continues-after-failure,
backfill catch-per-item (one symbol times out, the rest complete), and resumability
(a done symbol is never re-fetched).
`backfill-tasks.test.ts` — the live-wired tasks against a real migrated DB with mocked
fetchers: `runBackfillPool` resumability+catch-per-item under concurrency, prices/
fundamentals/edgar writes + BackfillProgress, `parseCompanyTickers`, and the period1
window math.
`jobs.test.ts` — stats (COALESCE, never-crash), news (RSS parse, dedupe, catch-per-query),
earnings (upsert dedupe), the overnight order + failure-resilience + one-JobRun-per-step,
and `runPricesHealJob` / `runDigestJob`.
