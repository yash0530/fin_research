# web/app/dossiers/ — Dossiers route

`page.tsx` lists queued/running/done dossiers from the DB with status, verdict/conviction,
and a link to the story page for BUY verdicts.

- `RunDeepDive.tsx` — **client** control (mounted on both the empty state and above the
  table): type 1+ tickers → `runDeepDiveAction` spawns `job.ts dossier --symbols=… --manage-llama`,
  which boots the model, runs the debate, then frees the RAM. Live status pill; input/button
  disable while a run is in progress. Replaces the old "run this in your terminal" text.
- `actions.ts` — **`"use server"`**: `runDeepDiveAction(symbolsCsv)` (validates tickers,
  rejects if a run is active, spawns the managed job) + `getRunStatusAction()` (polled by
  the client islands). Spawning lives in `@/lib/run-trigger`; the authoritative single-run
  guard is the spawned process's `acquireRunLock` (the check here is fast UI feedback).
