# v2-1 — Bank/REIT quality screens + earnings-yield valuation bands

Read first: `src/screens/CLAUDE.md`, `src/screens/fscore.ts` (the screen shape + `screenApplicability` pattern), `src/screens/merge-quarters.ts` (`mergeQuarters` + `quartersWith` — the freshest-complete-window helper EVERY multi-quarter screen must use, NOT a raw slice), `src/screens/ev.ts` (freshest-window EV/EBIT), `src/tools/valuation-history.ts`, `src/config/sectors.ts` (`g_financials`, `g_real_estate`). Input rows = `FundamentalsQuarter` (`src/screens/types.ts`) — available numeric fields ONLY: revenue, grossProfit, operatingIncome, netIncome, fcf, capex, totalAssets, totalDebt, cash, equity, sharesOut, cfo, sga, depreciation, receivables, currentAssets, currentLiabilities, retainedEarnings, ppe. **There are NO interest-income/expense fields, so a literal bank NIM is impossible — build the honest tractable screen from what exists and say so in warnings.**

## Build (all pure, fixture-tested, no DB/network — copy the style of fscore.ts)

1. `src/screens/bank-quality.ts` — quality screen for GICS Financials (`g_financials`). `screenApplicability(sectorCodes)` returns `{applicable:true}` ONLY for g_financials (the inverse of the quant screens). Over the freshest 4 complete quarters (`quartersWith(quarters, ["netIncome","totalAssets"])`, need ≥4): ROA = TTM NI / avg totalAssets (banks ~≥1% = strong); ROE = TTM NI / avg equity; capital ratio = equity / totalAssets (higher = safer); efficiency proxy = sga / revenue (lower = better, when both present). Output `{score, maxComputable, tests: {name, result: "pass"|"fail"|"unknown"}[], roa, roe, capitalRatio, warnings}`. Null inputs → that test "unknown" + warning, never silent. Add a header warning that this is a capital/return screen, not a true NIM/credit-quality model (v3).

2. `src/screens/reit-quality.ts` — for GICS Real Estate (`g_real_estate`). FFO ≈ netIncome + depreciation (the standard REIT proxy) over the freshest 4 complete quarters (`quartersWith(quarters, ["netIncome","depreciation"])`). Output `{ffoTtm, ffoPerShare (÷ sharesOut when present), ffoPayout (if a dividend field existed — it doesn't, so omit + warn), pFfo (marketCap ÷ ffoTtm, injected marketCap arg), verdict: "cheap"|"fair"|"rich"|"unknown", warnings}`. Cheapness thresholds documented in-code (e.g. P/FFO <15 cheap, 15–22 fair, >22 rich; negative FFO → "unknown" + suspended note).

3. `src/tools/earnings-yield.ts` — pure `computeEarningsYieldBands(closes: {d,close}[], quarters, sharesOut-source)`: monthly-sampled earnings yield E/P = (TTM EPS as-of date) / price, plus an optional `benchmarkYield` arg for the SPREAD (earnings yield − benchmark). Median ± 1×/2× MAD bands over trailing 5y (mirror valuation-history's band math EXACTLY — reuse its MAD helper; export it from valuation-history if needed rather than re-deriving). Output `{series, bands, current, spread, verdict: "cheap"|"fair"|"rich"|"suspended"}`. Negative TTM earnings → suspended.

## Wire-in
- `src/jobs/registry-live.ts` `screens` job: for `g_financials` symbols run bank-quality, for `g_real_estate` run reit-quality, and merge a `bank-quality`/`reit-quality` trigger tag + a `qualification.sectorScreen` block into the Candidate (NEVER overwrite userState; keep per-symbol catch). These sectors currently get NO screen — now they get their sector-appropriate one.

## Tests & docs
Co-located `*.test.ts` for every module (happy path, null-metric unknowns, freshest-window fallback, non-applicable sector rejection, negative-FFO/earnings suspension). Update `src/screens/CLAUDE.md`, `src/tools/CLAUDE.md`, `src/jobs/CLAUDE.md`.

## Gates (fix until green)
`npm run typecheck` · `npm test` · `npm run check:claude`. Append `## Result`. Do NOT commit. Touch only: src/screens/{bank-quality,reit-quality}*, src/tools/earnings-yield*, src/tools/valuation-history.ts (only if exporting the MAD helper), src/jobs/registry-live*, affected CLAUDE.md.

## Result
All requirements have been implemented successfully:
1. Created `src/screens/bank-quality.ts` (ROA, ROE, Capital Ratio, and Efficiency Proxy screens with appropriate bank-specific warnings).
2. Created `src/screens/reit-quality.ts` (FFO, FFO per Share, P/FFO cheapness screen with verdict classifications).
3. Created `src/tools/earnings-yield.ts` (monthly-sampled E/P trailing 5-year Median/MAD bands with optional benchmark spreads, reusing exported helpers from `src/tools/valuation-history.ts`).
4. Wired bank-quality and reit-quality screens into `src/jobs/registry-live.ts` `screens` job (merges `bank-quality`/`reit-quality` trigger tag and a `qualification.sectorScreen` block into Candidate).
5. Co-located tests `bank-quality.test.ts`, `reit-quality.test.ts`, and `earnings-yield.test.ts` fully pass.
6. TypeScript check (`npm run typecheck`), vitest test runner (`npm test`), and Claude metadata check (`npm run check:claude`) are all completely green.
