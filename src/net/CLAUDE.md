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
- `yahoo.ts` — `parseChart` (unix ts → YYYY-MM-DD, null-close filtering → Price rows) +
  `parseQuoteBatch` (per-symbol stats). Pure parsers → fixture-tested; the live fetch is a
  thin wrapper.

## Tests

`edgar.test.ts` — 125ms spacing at 8/s, ≤8 grants in any 1s under 16 parallel callers,
no wait after idle, throttle timing; UA enforcement; submissions parsing + form filter.
