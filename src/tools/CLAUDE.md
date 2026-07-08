# src/tools/ — evidence substrate + quant tools

The tool layer. Ports `finance/analysis/tools/` semantics: every tool returns a
`ToolResult`, execution never throws, and outputs accumulate in an `EvidenceLedger`
that agents cite from.

## Substrate

- `types.ts` — `ToolResult {data, sources[], confidence, cached, error?}`, the `Tool`
  interface, and `execute(tool, args)` — the **never-throw** wrapper (a raise becomes a
  low-confidence error result, so one bad tool never aborts a dossier).
- `evidence-ledger.ts` — `EvidenceLedger`: `add`, `okResults`, `latestByTool`,
  `citableTools()` (the namespace the evidence-validator enforces), and
  `evidencePrompt(maxCharsPerTool)` (capped, deterministic prompt rendering).
- `budget.ts` — `Budget`: wall-clock + LLM-call + tool-call caps (USD removed).
  Injectable clock → deterministic exhaustion tests.
- `cache.ts` — `ToolCache` (TTL, injectable clock) + `cacheKey(tool, args)` =
  `tool:sha1(stableStringify(args))` (order-independent).
- `registry.ts` — `ToolRegistry` (instance-based) + `promptCatalog()` for the planner.
- `factory.ts` — `buildProductionRegistry(db, opts)`: the **production wiring** that binds
  every tool to the REAL schema (Price / FundamentalsQuarter / Ticker / TickerSector /
  NewsItem / Catalyst). Local-data tools take no network; live tools take injected
  fetchers (`LiveFetchers`) and **degrade gracefully** to a low-confidence,
  `data_status:"missing"` result when offline. Every result keeps `sources[]`, an honest
  `confidence`, and an explicit `data_status` (`ok | partial | missing`) — never a silent
  empty. `qoe` is honestly `partial` (the local FundamentalsQuarter lacks the canonical
  Beneish/Altman/Piotroski inputs). Tested in `factory.test.ts` over a temp migrated DB.

## Quant tools (pure math, golden-tested)

- `dcf.ts` — 3-scenario discounted-cash-flow fair value.
- `qoe.ts` — Quality-of-Earnings forensics: Beneish M-Score, Altman Z, Piotroski F,
  accrual ratio, SBC%. Canonical formulas, golden-tested against hand-derived values.
- `technicals.ts` — SMA/EMA/RSI/MACD, golden-cross, 52-week breakout over despiked closes.
- `financial-trends.ts` — multi-quarter revenue/margin/FCF trajectory.
- `relative-rank.ts` — percentile ranks + spotlight tags across a universe.
- `sector-heat.ts` — sector return aggregation across both taxonomies.
- `sentiment.ts` — composite 0–10 score (Reddit mentions/polarity + news volume + RSS);
  deterministic scoring, tested. `news-tape.ts` — merge local + fetched news (dedup by
  id + normalized title, newest-first, capped).
- `capex-scorecard.ts` — hyperscaler capex scorecard (MSFT/AMZN/GOOGL/META): TTM capex +
  YoY growth per name and combined (signs normalized to positive spend), 12-quarter
  sparkline series, null-quarter warnings (never silent zeros); combined YoY only when
  every name has both windows — no mixed-basis percentages.
- `macro.ts` — macro regime classifier (VIX / yield-curve inversion / HYG-IEF credit).
  `peer-compare.ts` — percentile position within a sector cohort. `catalysts.ts` —
  upcoming-events window filter.
- `insider-form4.ts` — Form 4 XML parse (fast-xml-parser) + cluster-buy detection.
  `institutional.ts` — yahoo ownership parse. `options-metrics.ts` — P/C ratio, ATM IV,
  unusual-volume count. (Live fetch wrappers are thin; the parsing/scoring is tested here.)

## Invariants

- Pure math takes plain inputs and returns plain outputs (no DB/network) so it is
  golden-testable. Live data-fetching tools wrap these and pull from local tables.
- Always go through `execute()` — never call `tool.run()` directly in the pipeline.
