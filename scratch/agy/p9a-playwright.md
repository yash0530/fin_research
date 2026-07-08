# P9a — Playwright smoke suite (delegated part of P9)

Read first: `/Users/yash/.claude/plans/linear-mapping-blossom.md` phase P9. The 5 routes: `/`, `/themes`, `/tickers/[symbol]`, `/portfolio`, `/journal`.

## Build

1. `web/e2e/` — Playwright smoke suite (`@playwright/test` as web devDependency, chromium only):
   - Global setup builds a **temp fixture SQLite DB** (copy schema via migrations into a tmp file, seed ~3 tickers with prices/quarters/sectors + 1 watchlist entry + 1 candidate + 1 journal entry — reuse `src/db/seed-helpers` patterns via a small `web/e2e/fixture-db.ts` seeding script run with tsx) and starts `next start` against `DATABASE_URL=file:<tmpdb>` on a spare port (production build assumed done by the runner script).
   - One spec per route asserting: HTTP 200, key panel/test-id renders (sidebar brand "ENGINE", themes ranked table or empty state, ticker cockpit quadrants for a seeded symbol, portfolio positions panel or empty state, journal log or empty state), and **zero console errors** (fail on `page.on("console")` type=error, ignoring known Next hydration noise only if it actually appears — document any allowlist).
2. Wire into verification: root `package.json` script `verify:ui` = `cd web && npm run build && npx playwright test`; extend `npm run verify` to keep engine-only speed but document `verify:ui` in README + `docs/dev_guide.md` (do NOT make the root verify depend on a browser install).
3. `web/e2e/CLAUDE.md` describing the suite + how to run.

## Gates (fix until green)
`cd web && npx playwright install chromium` then `cd web && npm run build && npx playwright test` all green · root `npm run verify` still green · `npm run check:claude`. Append `## Result` with the playwright run output summary. Do NOT commit. Touch only: web/e2e/**, web/package.json, root package.json (verify:ui script), README.md, docs/dev_guide.md, affected CLAUDE.md.

## Result

Implemented directly (not delegated further) since this session was already tasked
with P9a end-to-end.

**Playwright run** (`npm run verify:ui` from repo root = `cd web && npm run build &&
npx playwright test`):

```
Running 5 tests using 5 workers
  ✓  journal.spec.ts › /journal renders the log + calibration console with zero console errors (215ms)
  ✓  portfolio.spec.ts › /portfolio renders positions + watchlist bands with zero console errors (222ms)
  ✓  action-center.spec.ts › Action Center (/) renders with zero console errors (231ms)
  ✓  themes.spec.ts › /themes redirects to /themes/ai and renders with zero console errors (238ms)
  ✓  ticker-cockpit.spec.ts › /tickers/TSTA renders the cockpit with zero console errors (278ms)
  5 passed (1.1s)
```

Chromium binary installed via `npx playwright install chromium` (v1228, downloaded
clean — no cache present beforehand). `web/.next` production build compiles + type-
checks clean first. No console errors observed on any route; the empty allowlist in
`console-errors.ts` was never needed.

**Root `npm run verify`** (unaffected — no browser dep added):
```
Test Files  85 passed (85)
     Tests  551 passed (551)
✓ CLAUDE.md present in all 55 directories.
```
(551 vs the 425 mentioned in the M3-close commit reflects everything landed since,
not this batch — P9a added zero `src/` tests, by design.)

**`npm run check:claude`**: green, 55/55 directories (added `web/e2e/CLAUDE.md`).

**Deviations from the literal spec, with reasons:**
- **Spare port**: used a fixed high port (`4319`, override via `E2E_PORT`) instead of
  dynamically probing a free one. Playwright's `webServer.command` is evaluated
  synchronously at config-load time, and Node has no synchronous free-port probe;
  dynamic discovery would need an extra async indirection for a smoke suite that
  doesn't warrant it. Documented in `web/e2e/env.ts` and `web/e2e/CLAUDE.md`.
- **Report/artifact location**: `outputDir` and the HTML reporter write under
  `os.tmpdir()` (`engine-e2e-artifacts/`) rather than the conventional
  `web/test-results/` + `web/playwright-report/` — those default paths are new repo
  directories Playwright creates/repopulates on every run, which would either need a
  standing `CLAUDE.md` (fragile — no guarantee Playwright never touches directory
  contents in a way that reads as "missing" to the coverage check) or a `check:claude`
  ignore-list edit (out of the allowed touch-list for this batch). Routing them outside
  the repo sidesteps the conflict entirely; confirmed via `git status --short` that a
  full `verify:ui` run leaves the working tree with zero stray files.
- **`WatchlistEntry`/`Candidate` inserts**: no `src/db/queries.ts` helper exists for
  these two tables yet (only raw SQL call-sites in `web/lib/*-data.ts`), so
  `fixture-db.ts` inserts them directly via `db.prepare(...).run(...)` matching the
  exact `0007_screens_funnel.sql` column shapes, rather than adding new query-layer
  helpers (out of scope — `src/db/queries.ts` wasn't on the touch-list).
- **Extra seed rows beyond the spec's minimum** (`Position`, `RecCall` for the primary
  symbol): added so `/portfolio`'s Held Positions grid and `/journal`'s calibration
  console render real rows too, in the spirit of "real panels, not just empty states."
  Kept to one row each — not gold-plated.
- **`import.meta.url` → `__dirname`**: `fixture-db.ts` is loaded two ways — Playwright's
  CJS-transpiling test loader (no `"type": "module"` in `web/package.json`) AND a
  direct `npx tsx web/e2e/fixture-db.ts <path>` CLI invocation for local debugging.
  `import.meta.url` broke under the former (`SyntaxError: Cannot use 'import.meta'
  outside a module`); switched to `__dirname` (tsx polyfills it in ESM mode too), and
  the CLI-detection check to a path-suffix regex instead of `require.main`/
  `import.meta.url` comparison, so both invocation paths work. Verified with a direct
  `tsx web/e2e/fixture-db.ts /tmp/....db` run after the fix.

No other deviations. `git status --short` after the full gate run:
```
 M README.md
 M docs/dev_guide.md
 M package.json
 M web/CLAUDE.md
 M web/package-lock.json
 M web/package.json
?? web/e2e/
?? web/playwright.config.ts
```
(plus this file, pre-existing untracked scratch/agy/*.md siblings, unrelated to this batch).
