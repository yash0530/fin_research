# web/e2e/ — Playwright smoke suite (P9a)

Chromium-only smoke suite over the 5 live routes (`/`, `/themes` → `/themes/ai`,
`/tickers/[symbol]`, `/portfolio`, `/journal`), run against a **temp fixture
SQLite DB** — never `data/engine.db`. Wired as the root `verify:ui` script;
**not** part of `npm run verify` (that gate stays engine-only, no browser
dependency).

## Run it

```bash
npx playwright install chromium   # once, downloads the browser binary
npm run verify:ui                 # from the repo root: web build + playwright test
# or, from web/:
npm run build && npx playwright test
```

## How it fits together

- `env.ts` — the shared `DB_PATH` (a fresh file under `os.tmpdir()` per process,
  named `engine-e2e-<uuid>.db`) and `PORT` (fixed at `4319`, override via
  `E2E_PORT` if it ever collides on a dev box — a dynamically-probed free port
  was skipped as overkill for a smoke suite). One module instance, imported by
  both `playwright.config.ts` (the `webServer.env.DATABASE_URL`) and
  `global-setup.ts` (what gets built), so they always agree.
- `fixture-db.ts` — `buildFixtureDb(dbPath)`: applies every
  `prisma/migrations/*.sql` through the real runner (`src/db/migrate.ts`, same
  path as `scripts/apply-migration.ts`), then seeds via the tested
  `src/db/queries.ts` helpers (`insertSectors`, `upsertTicker`,
  `linkTickerSector`, `insertPrices`, `insertFundamentals`, `saveRecCall`,
  `upsertPosition`) plus three direct inserts for tables with no query-layer
  helper yet (`WatchlistEntry`, `Candidate`, `JournalEntry`). Also runnable
  standalone for local debugging: `npx tsx web/e2e/fixture-db.ts <path>`.
- `fixture-data.ts` — the seeded symbol/sector-code constants, imported by both
  `fixture-db.ts` (what gets written) and the specs (what gets asserted) so
  they can never drift apart.
- `global-setup.ts` — Playwright's `globalSetup` hook; calls `buildFixtureDb`
  before `webServer` boots `next start` against it.
- `playwright.config.ts` (repo: `web/playwright.config.ts`) — chromium-only
  project, `webServer` runs `next start -p ${PORT}` with `DATABASE_URL` pointed
  at the fixture file, `reuseExistingServer: false` (always a clean boot).
  Report/trace/result artifacts are written under `os.tmpdir()`
  (`engine-e2e-artifacts/`), **never inside the repo** — so a leftover
  `test-results/`/`playwright-report/` directory can never trip
  `npm run check:claude` (every repo directory needs a `CLAUDE.md`; a tmpdir
  path sidesteps that entirely rather than requiring one there).
- `console-errors.ts` — `collectConsoleErrors(page, allowlist?)`: attaches
  `page.on("console")` (type `error`) and `page.on("pageerror")` listeners
  before navigation, returns the accumulating array for the spec to assert is
  empty at the end. **Allowlist is currently empty** — no known-benign message
  has actually reproduced in this suite. If one ever does (e.g. genuine Next.js
  hydration noise), add it to that spec's own allowlist array and record the
  exact string + justification in this file; never widen the shared default.

## What's seeded (`fixture-db.ts`)

3 tickers (`TSTA`/`TSTB`/`TSTC` — see `fixture-data.ts`), each with ~300
sessions of despike-friendly random-walk prices and 12 fully-computable
fundamentals quarters (steady growth, CFO > net income, deleveraging, flat/
shrinking share count — gives the on-the-fly screens real pass/fail signal
instead of "insufficient data" warnings). `TSTA` additionally carries a
`g_info_tech` **and** an `ai_compute_gpu` `TickerSector` link (dual-taxonomy
coverage), is `watchlisted`, and gets one `WatchlistEntry`, one `Candidate`
(`userState=INBOX`, tier 1), one `JournalEntry`, one `Position`, and one
`RecCall` — so every route renders a real panel for at least one name instead
of only empty states. The ticker-cockpit spec hits `TSTA` specifically.

## Specs

One file per route: `action-center.spec.ts`, `themes.spec.ts`,
`ticker-cockpit.spec.ts`, `portfolio.spec.ts`, `journal.spec.ts`. Each asserts
HTTP 200, a key panel/heading renders, and zero console errors. The themes spec
accepts either the ranked table or its "No ranked names" `EmptyState` — both
are a real render, not a crash; whether `rankTheme` produces a ranked or a
silo/empty result for the small fixture universe is an implementation detail
this suite doesn't pin down.

## Do NOT

- Touch `data/engine.db` — always a fresh temp file.
- Add automatic browser-install/download to `npm run verify` — `verify:ui` is
  the opt-in, browser-dependent gate, kept separate on purpose.
