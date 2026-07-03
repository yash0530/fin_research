# src/dossier/prompts/ — agent prompt modules

Rich prompt text for the multi-agent debate, extracted out of `agents.ts` so the
finance-grade rubrics live in one place per agent. **These are faithful ports of
`finance/analysis/agents/*.py` — edit them with the donor open side-by-side**, and
preserve the rubrics/tone/constraints rather than paraphrasing loosely.

## Module map

Each module exports `system: string` + a typed `user(args)` builder. The user builder
takes primitive inputs (ticker, analyzer `promptPrefix`, evidence block, prior-stage
outputs) — richer text, same data dependencies as the schemas in `../schemas.ts`.

- `planner.ts` — investigation planner (port of `planner.py`). Emits `PlanSchema`.
- `bull.ts` — strongest evidence-based long case (port of `bull.py`). Emits `BullSchema`.
- `bear.ts` — attacks the bull case AND builds an independent bear case (port of `bear.py`).
- `rebuttal.ts` — bull defends against the bear (port of `bull_rebuttal.py`).
- `judge.ts` — the crown jewel: conviction rubric (HIGH/MEDIUM/LOW) + `what_would_change_mind`
  + trade plan, ported verbatim from `judge.py`. Emits `VerdictSchema`.
- `critique.ts` — risk-officer review (port of `self_critique.py`). Emits `CritiqueSchema`.
- `memo.ts` — Living Memo delta synthesizer (port of `memo_synth.py`); exports
  `MEMO_SECTIONS`, the 10 canonical section names from `finance/analysis/living_memo.py`.

## Invariants

- Every agent instructs **STRICT JSON only** and cites evidence via `evidence_refs`
  where the schema has them ("no naked numbers").
- Prompts never promise tools/data we don't have — no live web search, no earnings-call
  transcripts. Filing- and catalyst-derived KPIs lean on our 8-K fallback
  (`catalysts` / `news_tape`); relative-rank signals use `relative_rank` (our port of
  the donor's `sp500_lookup`).
- Output shapes match `../schemas.ts` exactly — enrich the field *guidance* in prompt
  text, never the schema shape.

## Tests

`prompts.test.ts` — every module exports a non-empty system + user builder; the judge
system carries the HIGH/MEDIUM/LOW conviction rubric and `what_would_change_mind`; memo
names all 10 Living Memo sections; the bear demands both an attack and an independent
case; every user builder embeds the evidence block it is given.
