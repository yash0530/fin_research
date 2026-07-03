# web/app/capture/ — the paste-capture cockpit (the web app's only write path)

Full flow: pick template → `renderCaptureAction` (renders via @engine + inserts a
Capture row) → copy → paste reply → `parseCaptureAction` (@engine parseCapture +
stores raw/parseStatus) → per-item accept → `commitCaptureAction`
(@engine commitCapture → EvidenceItem origin=paste + DiscoveryCandidate upserts +
dated Catalysts, one txn).

- `actions.ts` — the server actions; thin adapters over the tested engine. Writes go
  through `lib/engine-write.openWritableDb()` (busy_timeout 8000, WAL).
- `CaptureFlow.tsx` — the client state machine (pick/copy/preview/done).
- All parsing/committing logic lives in `src/capture/` (tested there); the web layer
  never re-implements it.
