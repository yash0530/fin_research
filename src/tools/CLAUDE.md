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

## Quant tools (pure math, golden-tested)

- `dcf.ts` — 3-scenario discounted-cash-flow fair value.
- `qoe.ts` — Quality-of-Earnings forensics: Beneish M-Score, Altman Z, Piotroski F,
  accrual ratio, SBC%. Canonical formulas, golden-tested against hand-derived values.
- `technicals.ts` — SMA/EMA/RSI/MACD, golden-cross, 52-week breakout over despiked closes.
- `financial-trends.ts` — multi-quarter revenue/margin/FCF trajectory.
- `relative-rank.ts` — percentile ranks + spotlight tags across a universe.
- `sector-heat.ts` — sector return aggregation across both taxonomies.

## Invariants

- Pure math takes plain inputs and returns plain outputs (no DB/network) so it is
  golden-testable. Live data-fetching tools wrap these and pull from local tables.
- Always go through `execute()` — never call `tool.run()` directly in the pipeline.
