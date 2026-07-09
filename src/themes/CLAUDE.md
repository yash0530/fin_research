# src/themes/ — theme taxonomy + transparent ranking

Pure modules behind the `/themes` pages. No DB/network — everything operates on
injected rows (same contract as `src/screens/`).

- `taxonomy.ts` — themes are **config**: `THEMES` (v1: one `ai` theme whose 12
  subthemes map 1:1 onto the `ai_*` sector codes from `src/config/sectors`),
  plus lookups (`getTheme`, `getSubtheme`, `themeForSector`, `themeSectorCodes`).
  `allThemes(userThemes)` merges built-in themes and human-accepted custom user themes.
- `propose.ts` — `buildThemeProposal(clusters, evidence)` shapes emerging theme proposals and subthemes deterministically, using LLM-assisted naming and rationale generation.
- `rank.ts` — `rankTheme(inputs)`: three transparent 0-100 segments per name —
  **quality** (F-Score 60% + accruals 20% + dilution 20%, reusing `src/screens/*`),
  **valuation** (sector-relative EV/EBIT percentile inverted; P/S fallback when the
  multiple is suspended, with a warning), **momentum** (12-1 return minus GICS-sector
  median, percentile-scaled) — plus per-factor provenance strings (`subScores`).
  Composite = mean of available segments. **Honest ties** (shared rank + `tied`,
  competition ranking 1,2,2,4) and an **insufficient-data silo** (missing >1 segment →
  `silo`, never ranked last). `<10-name` sector cohorts emit warnings.
  `themeIntelligence(result)` → aggregate valuation percentile, quality-gate breadth,
  ranked/silo counts.

## Tests

- `rank.test.ts` — taxonomy shape + reverse lookup, 12-1 math, full-segment ranking,
  tie flags, silo behavior, P/S fallback provenance, financials quality exclusion,
  cohort-size warning, sector-neutral momentum.
- `propose.test.ts` — cluster→proposal shaping, LLM-naming via FakeProvider, evidence
  provenance preserved, and taxonomy `allThemes` merge.
