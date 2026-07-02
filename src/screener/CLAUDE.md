# src/screener/ — full-universe screening

Port of `screener_engine.py`. Pure: `runScreen(rows, config)` operates on injected
`TickerRow[]`, so it screens the whole S&P universe in milliseconds with no DB.

## engine.ts

- `RESOLVERS` — the screenable field namespace (marketCap, forwardPE, revenueGrowthPct,
  profitMarginPct, beta, yearChangePct, rsi, pctFrom52wHighPct). `screenableFields()`
  lists them.
- `UniverseSpec` — `sp500` | `ai_infra` | `watchlist` | `sector:{code}` (GICS or AI code).
- `Filter` operators — gt/gte/lt/lte/eq/between. **Missing data excludes a row** (a null
  metric never silently passes a filter).
- `runScreen` — universe filter → field filters → optional sort → optional limit;
  returns `{ matched, scanned, matchedCount }`.

## Tests

`engine.test.ts` — value filters, each universe spec, missing-data exclusion,
between + sort desc + limit, field namespace.
