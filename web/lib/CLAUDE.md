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
