# prisma/ — data model

`schema.prisma` — the full ENGINE data model (SQLite/WAL), validated with
`npx prisma validate` (✅). 30 models spanning the plan's migration groups:

- **full_market**: `Sector` (+taxonomy), `Ticker` (+source/watchlisted/cik),
  `TickerSector`, `Price`, `FundamentalsQuarter`, `EdgarFiling`, `BackfillProgress`.
- **news/series**: `NewsItem`, `Catalyst`, `ManualSeries`, `Digest`.
- **tools_screener**: `ToolCacheEntry`, `ScreenerConfig`, `DiscoveryCandidate`.
- **dossiers**: `Dossier`, `DossierStage` (@@unique dossierId+name), `ToolCall`, `Memo`,
  `MemoVersion`, `EvidenceItem`, `RecCall`.
- **story_pages**: `StoryPage`.
- **buylist**: `BuyList`, `BuyListItem`.
- **capture**: `PromptTemplate`, `Capture`.
- **ops**: `JournalEntry`, `Position`, `JobRun`.

## Conventions

- Market dates (`Price.d`, `Catalyst.d`, `FundamentalsQuarter.periodEnd`,
  `ManualSeries.d`) are `YYYY-MM-DD` strings; audit fields are DateTime.
- JSON payloads are `String` (SQLite has no native JSON in Prisma).
- Migrations are **additive, hand-written SQL** applied via `scripts/apply-migration.ts`
  (never `prisma migrate dev` against the live DB). `migrations/0001_init.sql` is the
  generated baseline.
