# src/net/ — network etiquette + external-source parsing

Pure/deterministic logic for talking to external APIs politely. The actual `fetch`
calls are thin wrappers over these; everything here is tested with fakes/fixtures.

## Files

- `rate-limiter.ts` — `RateLimiter(ratePerSec)`: slot-reservation model, grants spaced
  `1000/rate` ms apart so parallel callers **cannot exceed the rate**. Injectable clock →
  the ≤8 req/s guarantee is proven in tests. `throttle(fn, sleep)` is the async wrapper.
- `edgar.ts` — `requireUserAgent(env)` (enforces SEC's descriptive UA at startup),
  `EDGAR_LIMITER` (the ONE shared 8 req/s bucket every EDGAR caller must use), and
  `parseSubmissions(cik, symbol, json)` → typed filing rows, filtered to
  10-K/10-Q/8-K/4/DEF 14A. Pure parser → fixture-tested, no network.
- `edgar-form4.ts` — `fetchForm4` and `parseForm4Xml` to fetch and parse Form 4 XML filings, extracting only open-market purchases (code "P"), identifying 10b5-1 plan references via footnote analysis, and capturing owner role / 10% ownership status.
- `yahoo.ts` — `parseChart` (unix ts → YYYY-MM-DD, null-close filtering → Price rows) +
  `parseQuoteBatch` (per-symbol stats). Pure parsers → fixture-tested; the live fetch is a
  thin wrapper. (Legacy hand-rolled mappers, kept as a tested fallback reference.)
- `yahoo2.ts` — the **yahoo-finance2 transport** (the DECISION: naive Yahoo fetch is
  429-throttled from this IP; yahoo-finance2 carries the cookie/crumb dance). A THIN
  adapter: `fetchDailyBars` (chart), `fetchQuoteBatch` (quote, ≤100/call, chunked),
  `fetchQuarterlyFundamentals` (fundamentalsTimeSeries), `fetchTickerStats` (quoteSummary:
  defaultKeyStatistics/financialData/summaryDetail), `fetchEarningsDates` (calendarEvents).
  Each maps yahoo-finance2's result into OUR row types, tags `source:"yahoo2"`, and
  **never throws** (`[] / null` + error string); the client is injected (default = a
  silent singleton that suppresses schema-validation noise). Pure MAPPERS
  (`mapChartToBars`/`mapQuoteBatch`/`mapFundamentals`/`mapQuoteStats`/`mapEarnings`) +
  a bounded-concurrency `mapPool` are exported and fixture-tested.
- `route.ts` — provider-chain routing for **daily bars**: `routeDailyBars` tries yahoo2
  first, then (after a ≥2s stagger) falls back to the **Stooq CSV** endpoint
  (`stooqUrl`, `parseStooqCsv`, `fetchStooqDaily`, `source:"stooq"`), filtered to the
  requested window. Stats/fundamentals are yahoo2-only. Every returned row carries `source`.

## Tests

`edgar.test.ts` — 125ms spacing at 8/s, ≤8 grants in any 1s under 16 parallel callers,
no wait after idle, throttle timing; UA enforcement; submissions parsing + form filter.
`yahoo2.test.ts` — mappers (chart/quote/fundamentals-merge/quoteSummary/earnings), `mapPool`
order + concurrency cap, and every fetch wrapper returning `[] / null` + error on a throw
(all with a fake client — no network). `route.test.ts` — Stooq CSV parsing, `fetchStooqDaily`
never-throw, and the route (yahoo2 wins / staggered Stooq fallback / window filter /
both-empty).
