# v2 backlog — acceptance record

All deferred v2 items from the plan, implemented (mostly via agy), reviewed, and
verified live against the real DB. Final gates: 654 tests (99 files), CLAUDE.md in
all 55 dirs, web build + 5/5 Playwright, prisma valid; migrations through 0012.

| Batch | Delivered | Live check |
|---|---|---|
| v2-1 | bank-quality + reit-quality screens (excluded GICS 40/60 now screened) + earnings-yield MAD bands | screens job runs sector-appropriate |
| v2-2 | 11 chart-pattern detectors ported from donor (pure) | 25 tests |
| v2-3 | Brier + avoid-ledger + decision-streak scorecard + /journal console | console renders (Brier/avoid/streak) |
| v2-4 | spin-off 8-K detector → FilingEvent + Candidate tag | events8k wired |
| v2-5 | 13F superinvestor ingestion (mig 0011) + overlap screen | 273 holdings/9 filers; 71 Candidates tagged superinvestor; surfaces on /themes |
| v2-6 | customer-concentration extractor from 10-K text | live: NVDA flagged notable |
| v2-7 | human-gated LLM theme-creation sandbox (mig 0012, ThemeProposal/UserTheme) | Accept writes UserTheme (invariant #5) |
| v2-8 | narration money() units fix + EDGAR event population | 422 insider tx/94 syms/16 clusters, 51 8-K events |

Two live bugs surfaced+fixed during the work:
- form4 primaryDoc was the SEC XSL viewer path, not raw XML → 0 insider rows parsed
  universe-wide; rawForm4Doc() strips the prefix (now 422 tx).
- story money() formatted raw-dollar revenue as millions ("$39,648,000B").

All 6 routes render 200 with zero console errors against the live DB; every EDGAR
event job (form4 / events8k / holdings_13f / customer_concentration) has been run.
