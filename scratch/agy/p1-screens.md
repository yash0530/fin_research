# P1 — Screens & valuation engine

Read first: `/Users/yash/.claude/plans/linear-mapping-blossom.md` (sections "v1 signal set" items 1-3,8 and phase "P1"), and `/Users/yash/.gemini/antigravity-cli/brain/05119643-d841-4e4e-8f76-43a95ff8b5b8/quant_critique.md` (the hardening rules). This repo's conventions: `CLAUDE.md`, `src/CLAUDE.md`, `prisma/migrations/CLAUDE.md`.

## Build (all pure functions over injected data — no DB/network in modules; copy the style of `src/tools/financial-trends.ts`)

Input row type = the `FundamentalsQuarter` shape (see `prisma/schema.prisma:103`), all metrics nullable. Quarters passed oldest→newest. **Null inputs → test result "unknown" + a warning string, NEVER a silent fail/exclusion.** Financial/REIT sectors (`g_financials`, `g_real_estate`) are excluded by callers — export a `screenApplicability(sectorCodes)` helper returning `{applicable, reason}`.

1. `src/screens/fscore.ts` — Piotroski 9 tests comparing TTM (last 4q summed) vs prior TTM (q5-8). Output `{score, maxComputable, tests: {name, result: "pass"|"fail"|"unknown"}[], warnings}`.
2. `src/screens/accruals.ts` — Sloan: (TTM NI − TTM CFO)/avg totalAssets → `{value, verdict: "pass"|"warn"|"fail"|"unknown"}` (<0 pass, 0–0.10 warn, >0.10 fail).
3. `src/screens/dilution.ts` — 3y (12q) net share-count change pct → pass ≤0.
4. `src/screens/cohort.ts` — sector-relative cheapness: rows `{symbol, sectorCode, evToEbit}` → bottom 25% by EV/EBIT **within each sector** = cheap; `{cheap: Set<symbol>, warnings}` incl. "sector X cohort has <10 names".
5. `src/screens/earnings-trend.ts` — seasonal-naive z: EPS=netIncome/sharesOut; expected = EPS_{t−4} + mean(last 8 seasonal diffs); σ = stdev(last 12 seasonal errors); z=(actual−expected)/σ. Verdicts: `deteriorating` (z≤−1.5), `improvingUnconfirmed` (z≥1.5), `improvingConfirmed` only when caller passes `postReactionExcessReturn >= 0`, else `flat`. This is named "YoY earnings trend" everywhere — never "surprise".
6. `src/tools/valuation-history.ts` — from `{d, close}[]` + quarters: monthly-sampled P/E, P/S, P/FCF series using TTM per-share denominators as-of each date; bands = **median ± 1×/2× (1.4826·MAD)** over trailing 5y; if denominator ≤ 0 → that multiple is `suspended` (fall back to P/S for the verdict). Output `{series, bands, current, verdict: "cheap"|"fair"|"rich"|"suspended"}`.

## Persistence + job

7. Migration `prisma/migrations/0007_screens_funnel.sql` + matching `prisma/schema.prisma` models (additive only, follow 0006's style):
   - `Candidate(symbol TEXT PK, tier INTEGER, triggerTags TEXT/*json array*/, qualification TEXT/*json*/, computedAt TEXT, userState TEXT DEFAULT 'INBOX' CHECK IN ('INBOX','WATCHLIST','PORTFOLIO','ARCHIVED'))`
   - `WatchlistEntry(symbol TEXT PK, userLocked INTEGER DEFAULT 1, buyUnder REAL, valueBase REAL, valueLow REAL, valueHigh REAL, thesis TEXT, disconfirming TEXT, createdAt TEXT, updatedAt TEXT)`
   - `DecisionSnapshot(id INTEGER PK AUTOINCREMENT, symbol TEXT, createdAt TEXT, payload TEXT/*json*/)`
8. Add a `screens` job to `src/jobs/registry-live.ts` (follow existing job patterns + `runJob` never-crash semantics, catch per symbol): load universe quarters + sectors from DB, compute 1-5, upsert `Candidate` rows (tier 2 if passes quality gates incl. cheap cohort, tier 3 if merely computed; preserve existing `userState` — NEVER overwrite WATCHLIST/PORTFOLIO/ARCHIVED, and never delete rows). Extend `registry-live.test.ts` style tests with an in-memory DB.

## Tests & docs
Co-located `*.test.ts` fixture tests for every module (happy path + null-metric warnings + bank exclusion + negative-denominator suspension + tie/edge cases). New dir `src/screens/` needs a `CLAUDE.md`; update `src/CLAUDE.md` module map and `prisma/migrations/CLAUDE.md`.

## Gates (fix until green)
`npm run typecheck` · `npm test` · `npm run check:claude`. Then append `## Result` here (what was built, gate output summary). Do NOT commit. Do not touch files outside: src/screens/*, src/tools/valuation-history*, src/jobs/registry-live*, prisma/*, src/CLAUDE.md.

## Result

All screens, valuation history tool, migrations, job definitions, CLAUDE.md files, and unit/integration tests were fully built, verified, and are green.

### Summary of what was built:
1. **Piotroski F-Score Screen (`src/screens/fscore.ts`)**: Implemented all 9 tests comparing TTM vs prior TTM. Gracefully returns `"unknown"` for null inputs and lists warning strings.
2. **Sloan Accruals Screen (`src/screens/accruals.ts`)**: Computes `(TTM NI - TTM CFO) / average Total Assets` over the TTM quarters, returning verdicts `pass`, `warn`, `fail`, or `unknown`.
3. **3-Year Share Dilution Screen (`src/screens/dilution.ts`)**: Measures 12-quarter change in share count, passing if <= 0.
4. **Sector Cheapness Cohort Screen (`src/screens/cohort.ts`)**: Groups symbols by sector, sorts by EV/EBIT, and defines the bottom 25% as cheap. Warns if sector has < 10 names.
5. **YoY Earnings Trend Screen (`src/screens/earnings-trend.ts`)**: Implements seasonal-naive z-score EPS trend analysis using 12 trailing errors.
6. **Valuation History Tool (`src/tools/valuation-history.ts`)**: Computes monthly-sampled P/E, P/S, P/FCF series with trailing 5-year median ± 1x/2x MAD bands. Suspends multiples when denominator is non-positive and falls back to P/S.
7. **Funnel Database Schema & Migration (`prisma/migrations/0007_screens_funnel.sql` & `prisma/schema.prisma`)**: Created Candidates, WatchlistEntry, and DecisionSnapshot tables.
8. **Live Job Integration (`src/jobs/registry-live.ts`)**: Added the `screens` job to compute all screens and populate/upsert candidate rows without overwriting userState.
9. **Co-located Vitest Suites**: Wrote robust unit and database integration tests for all implemented files.

### Gate Output Summary:
- `npm run typecheck`: Passed successfully (no errors).
- `npm test`: Passed successfully (76 test files, 465 tests, 0 failures).
- `npm run check:claude`: Passed successfully (all 62 directories covered).
- `npm run verify` (typecheck + test + check:claude): Passed successfully.

