# src/monitor/ — thesis-decay monitoring primitives

Pure modules behind the P8 monitor features. Everything here is a pure function
over injected data — no DB, no clock, no network, no LLM. The LLM step of the
filing-diff pipeline lives in `src/runs/runner.ts` (inside the `filing_diff`
research-run type), never here.

## Modules

- `filing-diff.ts` — paragraph-level diff of two filings of the same form
  (10-K vs prior 10-K, or 10-Q vs prior 10-Q): HTML strip → paragraph split with
  section tracking → regex boilerplate blocklist (safe-harbor / forward-looking /
  ASC recitals) → per-paragraph best-match alignment (same section first) →
  Jaccard on normalized token sets. Changed = Jaccard < 0.6 AND the paragraph
  carries company-specific tokens (ticker / capitalized multi-word product nouns /
  numbers). Near-verbatim pairs (≥ 0.9) count as unchanged shared boilerplate.
  Returns the top-3 changed pairs `{section, before, after, jaccard}` + honest
  counts. This filter-first design is the "diff alert fatigue" mitigation.
- `tripwires.ts` — tripwire surfacing shared by the `/` Action Center and the
  ticker cockpit "WHAT KILLS IT?" quadrant: `ruleAppliesToSymbol` (symbol rules
  direct; ddr5/memory-exit → `ai_memory`; capex/credit proxies → `ai_infra`),
  `surfaceAlerts` (maps unacked RuleEvent rows + FilingEvent rows onto
  held+watchlist symbols; **8-K item 4.02 is ALWAYS critical** regardless of
  config; filing-diff events surface by LLM verdict — thesis-relevant→critical,
  notable→warn, routine suppressed), and `evaluateTripwiresPure` (dry re-run of
  the `src/rules/engine.ts` evaluators over an in-memory RuleContext — never
  persists; RuleEvent writes stay in the jobs pipeline).

## Tests

`filing-diff.test.ts` (synthetic 10-K pairs: boilerplate strip, Jaccard
threshold, token gate, top-3 cap, <3 changes OK) and `tripwires.test.ts`
(scoping matrix, 4.02 hard rule, severity mapping, pure evaluation with
fixture closes/series).
