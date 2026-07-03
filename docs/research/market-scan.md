# Market scan — how others build local LLM finance research engines (Jul 2026)

Research inputs: web survey (Claude), delegated deep scan (agy/Gemini), and **live
verification on this machine** (marked ⚡ — these are observed facts, not reports).
Purpose: validate/adjust fin_research's architecture before the heavy build waves.

## The landscape

### TradingAgents (TauricResearch) — closest analogue, ~80k★
Multi-agent LLM "trading firm": analyst team → **bull vs. bear researcher debate** →
trader → risk/portfolio approval, LangGraph-orchestrated, Pydantic-typed messages
between agents, local-model support (Ollama/llama.cpp), structured outputs via
tool-use channels ([github](https://github.com/TauricResearch/TradingAgents),
[arXiv:2412.20138](https://arxiv.org/abs/2412.20138),
[overview](https://apidog.com/blog/tradingagents-multi-agent-llm-trading/)).
Known weaknesses: token burn + latency from long sequential chains; "telephone game"
information decay across agents.
**Reading for us:** our dossier engine is independently convergent (debate, typed
schemas, checkpointing). Their pain points endorse two of our choices: persistable
resumable stages, and keeping the chain SHORT (7 LLM stages, tools computed in code).

### virattt/ai-hedge-fund
Investor-persona agents (Buffett/Munger/Burry/…) + valuation/technical/sentiment
agents ([github](https://github.com/virattt/ai-hedge-fund)). Does well: one file per
agent, metrics computed in Python before prompting. Does poorly: personas doing math,
hallucination on missing data, risk management as a *suggestive agent* instead of code.
**Reading for us:** validates "no naked numbers" + the deterministic sizing governor.
Adopt their explicit `data_status: complete|partial|missing` handshake — tools should
say what's missing, not pass empty strings into prompts.

### OpenBB Platform
Universal data router (yfinance/FRED/EDGAR/Stooq/CBOE) with provider extensions
([openbb.co](https://openbb.co)). Heavy dependency footprint. **Decision: do not
embed.** Adopt the *idea*: provider-decoupled data routing — swapping a dead source
is a config change, not a parser rewrite. Our `net/` fetchers get a `source` field
and a fallback chain instead.

### FinRobot / FinGPT (AI4Finance)
Staged CoT (data → concept → thesis), instruction-tuned small models, RAG over
filings ([FinGPT](https://github.com/AI4Finance-Foundation/FinGPT),
[FinRobot](https://github.com/AI4Finance-Foundation/FinRobot)). **Deliberate
divergence:** we keep distillation-over-RAG (versioned Living Memos) — a personal
single-user engine rereads its own memos; a vector DB adds infra for marginal gain at
our scale. Revisit only if filing-grounding proves weak in practice.

### StockBench (evals)
Benchmarks LLM agents on realistic trading ([stockbench.github.io](https://stockbench.github.io/)).
**Reading for us:** don't chase backtested alpha claims; our calibration ledger (real
verdicts, real outcomes, favorable-rate by conviction tier) is the honest personal
equivalent.

## Data access reality (2026)

- **Yahoo unofficial API** ⚡ *verified on this machine, Jul 2:* naive requests are
  aggressively throttled — `query1` 429 on first touch; `query2` served one 200 then
  429'd everything including 10y ranges. Community consensus: cookie+crumb session
  and browser-like headers are mandatory; bad crumbs happen and need re-auth
  ([yfinance #2441](https://github.com/ranaroussi/yfinance/issues/2441),
  [crumb mechanics](https://www.codestudy.net/blog/yahoo-finance-api-get-quotes-returns-invalid-cookie/)).
  **Decision: adopt `yahoo-finance2` as Yahoo transport** (battle-tested crumb
  handling; ENGINE ran a real 131-symbol × 400-day backfill through it in Jun 2026).
  Our hand-rolled parsers stay as unit-tested fallback mappers over raw endpoints.
- **SEC EDGAR:** reliable + official; descriptive User-Agent required; ≤10 req/s (we
  budget 8). Primary for filings/Form 4/CIKs. Unchanged.
- **Fallback chain (new):** Stooq daily CSV (no auth; gentle pacing — IP bans if
  hammered) → Tiingo free (good EOD quality; caps: ~500 unique symbols/mo, 50
  req/hr — fallback only at our 634-ticker scale, needs key) → Finnhub free (60/min,
  quotes+news). Alpha Vantage rejected (25 calls/day is unusable).
- **Aggressive local caching** is unanimous best practice → our 10y SQLite backfill
  + heal-forward model is the right shape.

## Local-model serving for structured JSON ⚡ (live-verified Jul 2)

Observed on our llama-server (b9620, qwen3.6-27b):
1. `chat_template_kwargs: {"enable_thinking": false}` → clean JSON in `content`
   (11 tokens). **The toggle works over the API.**
2. Thinking ON with small `max_tokens` → `content: ""`, entire budget consumed by
   `reasoning_content`, `finish_reason: "length"` — a **silent empty-output failure
   mode** our provider must detect (typed error → retry, degrade to no-think).
3. Thinking ON with 2000 tokens → correct JSON after ~1.9k chars of reasoning (26s).
4. llama.cpp caveats from upstream: grammar/response_format enforcement is
   **inactive while thinking is enabled**
   ([#20345](https://github.com/ggml-org/llama.cpp/issues/20345)); json_schema vs
   grammar conflicts ([#11847](https://github.com/ggml-org/llama.cpp/issues/11847));
   grammar failures **fail open** ([#19051](https://github.com/ggml-org/llama.cpp/issues/19051)).
   ⇒ Enforcement strategy: jsonsafe + zod + retry-with-validation-error (already
   built) is the real guarantee; `response_format: json_object` only for
   thinking-OFF calls; never trust grammar constraints alone.
5. Community pattern worth noting: a leading `"thought_process"` schema field as a
   CoT scratchpad for non-thinking models
   ([instructor guide](https://python.useinstructor.com/integrations/llama-cpp-python/)).
   We prefer native thinking for reasoning roles; keep this as a fallback lever if
   JSON quality disappoints.

## Digest/dashboard stickiness (survey of personal-build write-ups)

Sticky: anomaly-triggered push notes, 3-bullet plain digests, human-editable local
ledgers. Abandoned: widget-heavy dashboards ("dashboard fatigue"), fragile bank
syncs, raw AI buy/sell pushes (trust decay).
**Readings for us:** (a) our read-once morning digest with ranked, provenance-backed
insights is on the right side of this; keep the UI lean and digest-first. (b) Yash
deliberately removed push paging in ENGINE — we honor that; a config-gated optional
"digest headline → webhook" is BACKLOG for his decision, default off. (c) The
buy-list stays decision-support with human logging — never auto-recommendation spam.

## Adopt / reject decisions (folded into specs)

| # | Decision | Where it lands |
|---|---|---|
| 1 | yahoo-finance2 as Yahoo transport; parsers → fallback | Wave 3 spec (backfill) |
| 2 | Provider-decoupled fetch chain w/ `source` tag + fallbacks (Stooq/Tiingo/Finnhub) | Wave 3 spec |
| 3 | Thinking contract in HttpProvider (toggle, budget-exhaustion error, no-think degrade) | provider-hardening spec (P0) |
| 4 | `data_status` handshake on tool results (complete/partial/missing) | tools polish, Wave 2/3 |
| 5 | Keep short debate chain + stage checkpointing (validated) | no change |
| 6 | Keep distillation-over-RAG (deliberate divergence) | no change; revisit post-v1 |
| 7 | Keep deterministic governor + math-in-code (validated) | no change |
| 8 | Lean digest-first UI; no push by default; webhook = backlog | Wave 5 scope guard |
| 9 | Reject OpenBB embedding, Alpha Vantage | recorded here |
| 10 | Calibration ledger over backtest claims | no change |
