# Kiro batch A — Rich agent prompts + sector analyzer depth (NEXT_RUN 1.1 + 1.2)

## Intent
The dossier engine's prompts are currently 1–2 line placeholders in
`src/dossier/agents.ts`. Port the REAL prompt content from the donor Python repo so
a local Qwen 3.6 27B produces finance-grade debate output. This is a faithful port,
not a rewrite: preserve the rubrics, tone, and constraints of the originals, adapted
to our completeJson/zod contract.

## Donor sources (READ-ONLY — never modify these repos)
- `/Users/yash/Desktop/Programming/finance/analysis/agents/planner.py`
- `/Users/yash/Desktop/Programming/finance/analysis/agents/bull.py`
- `/Users/yash/Desktop/Programming/finance/analysis/agents/bear.py`
- `/Users/yash/Desktop/Programming/finance/analysis/agents/bull_rebuttal.py`
- `/Users/yash/Desktop/Programming/finance/analysis/agents/judge.py`  ← the crown jewel; port its conviction rubric + verdict field guidance verbatim
- `/Users/yash/Desktop/Programming/finance/analysis/agents/self_critique.py`
- `/Users/yash/Desktop/Programming/finance/analysis/agents/memo_synth.py`
- `/Users/yash/Desktop/Programming/finance/analysis/analyzers/*.py` (8 sector analyzers: generic, semis, saas, banks, biotech, energy, consumer, reits)
- `/Users/yash/Desktop/Programming/finance/analysis/living_memo.py` (the 10 memo section names — memo_synth must know them)

## Deliverables (files to create/modify in THIS repo only)
1. NEW `src/dossier/prompts/` — one module per agent
   (`planner.ts, bull.ts, bear.ts, rebuttal.ts, judge.ts, critique.ts, memo.ts`),
   each exporting `system: string` and a typed `user(...)` builder. Keep the existing
   prompt-assembly inputs (ticker, analyzer promptPrefix, evidence block, prior stage
   outputs) — richer text, same data dependencies. Every agent instructs STRICT JSON
   only + cites evidence via evidence_refs where the schema has them.
2. MODIFY `src/dossier/agents.ts` — import from `prompts/`; no signature changes;
   zod schemas in `schemas.ts` stay the contract (extend field guidance in prompt
   text, not schema shape).
3. MODIFY `src/dossier/analyzers.ts` — flesh each of the 8 analyzers' `promptPrefix`
   with the donor's sector KPI checklists (SaaS: ARR/NRR/Rule-of-40/magic number;
   banks: NIM/efficiency/Tier-1/ROTCE; REITs: FFO/AFFO/occupancy/WALT; biotech:
   pipeline phases/PDUFA/runway; semis/energy/consumer/generic equivalents) and
   requiredTools lists that match our TS tool registry names (see
   `src/tools/registry.ts` for what exists — do not reference tools we don't have).
4. NEW `src/dossier/prompts/prompts.test.ts` — asserts: every prompt module exports
   non-empty system + user builder; judge system text contains the conviction rubric
   markers ("HIGH", "MEDIUM", "LOW" with their conditions) and "what_would_change_mind";
   memo prompt names all 10 Living Memo sections; bear prompt demands BOTH an attack
   on the bull case AND an independent bear case; every user builder includes the
   evidence block it's given.
5. Per-directory CLAUDE.md: add `src/dossier/prompts/CLAUDE.md` (module map + "prompts
   are ports of finance/analysis/agents — edit with the donor open side-by-side").
6. Update `TASKS.md`: mark NEXT_RUN Phase 1.1 + 1.2 done with evidence lines; ALSO
   fix run-1 honesty items: M2.8 label "golden tests vs Python values" → "golden
   tests, hand-derived values"; route count "9 routes" → "8 routes".

## Hard constraints
- Do NOT change zod schemas' shapes, runner.ts flow, or any public signatures.
- Do NOT touch prisma/, web/, scripts/, or any file not listed above.
- Do NOT commit. Do NOT create new npm dependencies.
- Prompt text must not promise tools/data we don't have (no live web search, no
  transcripts — we have an 8-K fallback tool).

## Gates (run from repo root; fix until green)
- `npm run verify`  (tsc --noEmit + vitest run + CLAUDE.md coverage)

## Wrap-up
Append a `## Result` section to THIS file: what changed (file list), test count
before/after, any donor content you had to adapt or skip and why. Do NOT commit.
