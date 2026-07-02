# src/jobs/ — job orchestration

The control-flow that must be correct regardless of what the live fetchers do. Pure over
injected dependencies → fully tested with fakes (no network).

## Files

- `runner.ts`
  - `runJob(name, fn, record?)` — the **jobs-never-crash** wrapper: a thrown error becomes
    `{ok:false, detail}`, never propagates. `record` persists a JobRun row in the app.
  - `runChain(steps, record?)` — runs steps in order; a **failed step never aborts** the
    chain (failures are counted). This is the overnight pipeline shape
    (prices→news→earnings→…→digest).
- `backfill.ts`
  - `runBackfill(deps)` — generic **resumable** (skip `isDone` symbols) + **catch-per-item**
    orchestrator. Live Yahoo/EDGAR fetchers plug into `fetchOne`; persistence into
    `write`/`markDone`/`markError`; `onEach` for rate-limit pauses. Returns
    `{done, errors, skipped, rows}`.

## Tests

`backfill.test.ts` — job success/failure capture, chain-continues-after-failure,
backfill catch-per-item (one symbol times out, the rest complete), and resumability
(a done symbol is never re-fetched).
