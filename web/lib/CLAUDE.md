# web/lib/ — data layer

Server-only readers (`node:sqlite`, read-only `openDb()`) and the one writable-DB
opener. Every reader degrades gracefully (`null`/`[]`) when the DB or a table is
missing — a fresh install must never crash a page.

- `dashboard-data.ts` — `loadDashboard()` for `/`: merges `loadPortfolio()` decay
  findings with `@engine/monitor/tripwires` `surfaceAlerts` (unacked `RuleEvent`
  fires scoped onto held+watchlist symbols, plus `FilingEvent` alerts — 8-K item
  4.02 always critical, non-routine filing-diffs by LLM verdict) into `alerts`;
  a compact hyperscaler `capex` scorecard when an AI-subtheme name is
  held/watchlisted; watchlist buy-band distance
  (`watchlistBand`); 7d `Catalyst` rows; the Sourcing Inbox (`Candidate`
  `userState=INBOX`, tier 1-2 → `inbox`, tier 3 → `killedByQuality`); the header
  micro-strip (`governor`: portfolio value/cost basis, this month's `BuyList`
  capital/deployed/cash, per-tier `TierSummary`); `latestDigest()`; a portfolio
  snapshot row list; and `staleDays` (days since the latest `JobRun`/`Digest`, for
  the welcome-back banner).
- `portfolio-data.ts` — `loadPortfolio()` (positions + `@engine/portfolio/decay`
  findings + latest verdict, unchanged) + `loadWatchlistBandGrid()` (every
  `WatchlistEntry` decorated with despiked close, buy-under distance, and
  `Candidate.tier`, sorted by distance-to-buy-under × tier — the `/portfolio`
  5-col grid).
- `buy-ceremony-data.ts` — the monthly buy-ceremony wizard's compute layer:
  `loadHarvestCandidates()` (recent BUY-verdict RecCalls × watchlist buy-band,
  step 1) and `previewBuyList(selectedSymbols)` (live `governSize` recompute +
  `buildBuyList` allocation over `settings.buylist`, step 2). `ceremonyDue(month,
  today)` — no `BuyList` row this month AND day-of-month ≤14.
- `journal-data.ts` — `listJournalEntries()` (raw `JournalEntry` rows) +
  `listJournalEntriesWithSnapshots()` (paired with their frozen
  `DecisionSnapshot` by exact symbol+createdAt match, plus a `YYYY-Qn` quarter
  label) + `mistakeTaxonomy()` (mechanical `JournalEntry`×`RecCall.thesisFalsified`
  cross-reference, bucketed by action).
- `calibration-data.ts` — SQLite reader for `RecCall` rows and conviction tier
  summaries/governor status line builders (mirrors `src/calibration/governor.ts`).
  Also exports `loadScorecard(horizon)` returning the full `Scorecard` (Brier, avoid ledger, streaks).
- `buylist-data.ts` — SQLite reader for `BuyList`/`BuyListItem` + a BUY-verdict
  `RecCall` candidates preview (`getCandidatesPreview`, reused by
  `buy-ceremony-data.ts`'s harvest step).
- `ticker-data.ts` — SQLite reader for ticker details, OHLCV, technical
  indicators, and on-the-fly screener scoring (despike now imported from
  `@engine/lib/metrics`, not a local mirror). The cockpit's `activeTripwires`
  come from `@engine/monitor/tripwires` `alertsForSymbol` (rule scoping +
  always-critical 4.02 + filing-diff events), and `screenWarnings` aggregates
  the screen modules' data-quality warnings for the amber chip.
- `themes-data.ts` — SQLite reader for `/themes` (delegates ranking to
  `@engine/themes`; despike likewise from `@engine/lib/metrics`). Also
  `loadCapexScorecard()` — MSFT/AMZN/GOOGL/META quarterly capex →
  `@engine/tools/capex-scorecard` (AI-theme widget + the `/` compact strip).
- `digest-types.ts` / `digest-data.ts` — mirrored Digest types + SQLite reader
  (`latestDigest`, `digestByDate`, `listDigests`).
- `run-trigger.ts` — **server-only**: spawn an engine job as a DETACHED child
  (`repoRoot()/node_modules/.bin/tsx scripts/job.ts <name> [args] [--manage-llama]`,
  `cwd=repoRoot`, absolute `DATABASE_URL`, stdout→`data/logs/ondemand-*.log`). The web
  app's ONE place that spawns a process — the 40-min dossier runs OUT of the Next request.
  Also exports `repoRoot()` + `runLockPath()`.
- `run-status.ts` — **server-only**: `getRunStatus()` assembles the polled UI status from
  the run-lock (`@engine/jobs/run-lock`) + a short llama `/health` probe → `{ busy, phase:
  idle|booting|running, job, symbols }`. Cheap enough to poll every ~3s; exposed to
  client islands via `app/actions.ts`'s `getRunStatusAction`.
- `engine-write.ts` — the ONLY writable-DB opener (`openWritableDb()`), same
  WAL/busy_timeout discipline as the CLI jobs. Every `"use server"` action file
  that mutates data opens through this.

## P7 removals

`demo.ts`, `despike.ts` (both mirrors retired — `ticker-data.ts`/`themes-data.ts`
now import `despike` from `@engine/lib/metrics`), `screener-data.ts`,
`signals-data.ts`, `discovery-data.ts`, `memo-data.ts`, `story-data.ts`,
`story-types.ts`, `live.ts`, `dossier-data.ts`, `dossier-types.ts` — all were
single-page readers for routes deleted in P7 (their functionality either moved
into `dashboard-data.ts`/`journal-data.ts` or is now covered directly in the
ticker cockpit page).
