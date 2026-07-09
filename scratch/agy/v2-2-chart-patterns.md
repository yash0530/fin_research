# v2-2 — Chart-pattern detectors (port donor → TS, pure)

Read first: the donor at `/Users/yash/Desktop/Programming/finance/analysis/pattern_detectors.py` (1097 lines, 11 detectors) + its tests `/Users/yash/Desktop/Programming/finance/analysis/tests/test_patterns.py` (port the test CASES too). Repo conventions: `src/tools/CLAUDE.md`, `src/tools/technicals.ts` (the existing pure price-series tool style + how despiked closes flow), `src/lib/metrics.ts` (despike). This repo is TS strict — no `any`, typed returns.

## Build

1. `src/tools/chart-patterns.ts` — a faithful TypeScript port of ALL 11 donor detectors, pure over `{ closes: number[]; dates: string[] }` (despiked closes, `YYYY-MM-DD` dates — same contract as technicals.ts):
   `detectHeadAndShoulders`, `detectInverseHeadAndShoulders`, `detectDoubleTop`, `detectDoubleBottom`, `detectTripleTop`, `detectTripleBottom`, `detectAscendingTriangle`, `detectDescendingTriangle`, `detectCupAndHandle`, `detectBullishFlag`, `detectFallingWedge`. Preserve each detector's window defaults, geometry math, OLS-line helper (`_fit_ols_line`), and confidence scoring EXACTLY (this is a geometry port, not a redesign). Each returns `PatternResult | null` = `{detected: true, patternType, patternName, direction: "bullish"|"bearish", confidence /*0-100*/, neckline?, startDate, endDate, patternHeightPct} | null`.
2. `detectAllPatterns(series)` — runs every detector, returns the detected patterns sorted by confidence desc (empty array when none). Guard: too-few-bars → `[]`, never throw.

## Tests & docs
Co-located `chart-patterns.test.ts`: port the donor's synthetic-series fixtures (a hand-built H&S series detects H&S; a flat/noisy series detects nothing; each detector has ≥1 positive + the negative case). Assert pattern type, direction, and that confidence ∈ [0,100]. Update `src/tools/CLAUDE.md`.

## Notes
- v1 deliberately has NO chart-pattern glyphs on the candle chart — this batch delivers the ENGINE only (pure detectors + tests). UI surfacing is a later batch; do NOT touch web/.
- Keep it dependency-light (no stats libs — hand-roll the OLS line like the donor).

## Gates (fix until green)
`npm run typecheck` · `npm test` · `npm run check:claude`. Append `## Result`. Do NOT commit. Touch only: src/tools/chart-patterns*, src/tools/CLAUDE.md.
