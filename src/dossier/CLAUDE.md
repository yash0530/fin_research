# src/dossier/ — multi-agent debate engine

The deep-dive brain: a resumable, single-flight bull/bear/judge debate that turns an
evidence ledger into a structured, citation-checked verdict + a governed RecCall.
Port of `finance/analysis/agent_loop.py` + `agents/*.py`, re-architected as a
persistable state machine (the Python was a synchronous SSE stream).

## Files

- `schemas.ts` — zod schemas for every agent; the `Verdict` mirrors judge.py's contract
  (recommendation BUY/HOLD/TRIM/AVOID, conviction, bull/bear cases, ≥3
  what_would_change_mind, trade_plan with position_size_pct 0–15).
- `analyzers.ts` — 8 sector analyzers (data objects) + deterministic `classify()`.
- `evidence-validation.ts` — `validateVerdict` / `dropUncited`: a claim survives only
  if it cites a citable tool or a `paste:{id}` ("no naked numbers").
- `agents.ts` — `runPlanner/Bull/Bear/Rebuttal/Judge/Critique/Memo`; each builds a
  prompt and calls `completeJson` with its schema. Thinking ON for reasoning roles,
  OFF for memo (per config/settings).
- `state.ts` — `DossierState`, `RecCall`, and `DossierStore` (with `InMemoryDossierStore`
  for tests; a Prisma-backed store implements the same interface in prod).
- `runner.ts` — `runDossier(id, deps)`: the state machine. Resumable (reuses completed
  stages, rebuilds the ledger from persisted `toolCalls`), single-flight (every LLM call
  wrapped in `withLlmLock`), budget-aware (bails cleanly with a partial transcript),
  never-crash (judge falls back to HOLD/LOW on `LlmJsonError`).
- `queue.ts` — `enqueueDossier` (dedupe), `drainOnce` (oldest, one per tick),
  `recoverStale` (requeue >90-min "running" on boot).
- `job.ts` — `runDossierJob(db, symbols, deps)`: the **live job core** (factored out of
  `scripts/job.ts` so it is FakeProvider-testable). Enqueues (deduped) → drains oldest-first
  one at a time → for each dossier builds the production tool registry
  (`tools/factory.buildProductionRegistry`) over the real DB, pulls `currentPrice` (latest
  Price close), `memoSummary` (Memo table, null-safe), and a history-aware governor
  (`calibration/governor`), runs `runDossier`, then persists the governed `RecCall` and
  emits a verdict summary. `runner.onStage` is threaded to log each stage transition with
  elapsed seconds. Tested in `job.test.ts` (run · dedupe · resume).

## Invariants

- The judge NEVER crashes the pipeline — `fallbackVerdict` on malformed output.
- Uncited claims are dropped before a verdict is persisted.
- Size is governed at write time; the raw judge size is never trusted directly.
- `providerFor(role)` + `DossierStore` are injected → the whole engine is driven
  deterministically by `FakeProvider` in tests (no network, no llama-server).

## Tests

`dossier-runner.test.ts` (happy path · uncited-drop · judge fallback · budget
exhaustion · resume-after-bear) · `queue.test.ts` · `validation-classify.test.ts` ·
`job.test.ts` (live job path: run + governed RecCall · dedupe · resume).
