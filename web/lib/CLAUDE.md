# web/lib/ — data layer

- `demo.ts` — fixture inputs (`demoSynthInput`, `demoUniverse`, `demoCandidates`,
  `demoStory`, `demoDossiers`) that pages pass **through the real engine functions**.
  This makes the demo deterministic and proves the integration; it is replaced by live
  Prisma reads in the app-layer wiring tracked in `../../TASKS.md`.
- `live.ts` — live-data reader for digest pages. Opens the SQLite DB via dynamic import
  of `node:sqlite` and reads through the engine data layer. Server-only.
- `calibration-data.ts` — SQLite reader for `RecCall` rows and conviction tier summaries/governor status line builders.
- `buylist-data.ts` — SQLite reader for `BuyList`/`BuyListItem` tables, with active candidates preview.
- `story-types.ts` — mirrored `StoryPageData` types (from `src/story/schema.ts`) plus
  helpers (`impliedPrice`, `scenarioPrices`) and a `demoStory()` fixture. Web must not
  import from root `src/`; these types are kept in sync manually.
- `story-data.ts` — SQLite reader for `StoryPage` rows (following `live.ts` pattern).
  `loadStoryPage(id)` returns parsed `StoryPageData` or null; `listStoryPages()` returns
  id/symbol/title/createdAt list, newest first. Graceful fallback when DB/table is missing.
- `signals-data.ts` — SQLite reader for `RuleEvent` rows (id, ruleId, firedAt, severity,
  message, acked). Returns newest-first. Used by `app/signals/page.tsx`.
- `journal-data.ts` — SQLite reader for `JournalEntry` rows (id, symbol, action, thesis,
  invalidation, createdAt). Returns newest-first. Used by `app/journal/page.tsx`.
- `run-trigger.ts` — **server-only**: spawn an engine job as a DETACHED child
  (`repoRoot()/node_modules/.bin/tsx scripts/job.ts <name> [args] [--manage-llama]`,
  `cwd=repoRoot`, absolute `DATABASE_URL`, stdout→`data/logs/ondemand-*.log`). The web
  app's ONE place that spawns a process — the 40-min dossier runs OUT of the Next request.
  Also exports `repoRoot()` + `runLockPath()`.
- `run-status.ts` — **server-only**: `getRunStatus()` assembles the polled UI status from
  the run-lock (`@engine/jobs/run-lock`) + a short llama `/health` probe → `{ busy, phase:
  idle|booting|running, job, symbols }`. Cheap enough to poll every ~3s.
