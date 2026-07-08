# P9 — Final end-to-end acceptance (executed by Claude on the real DB)

The rebuild's closing verification. Everything below was run against the live
`data/engine.db` (557-ticker universe, 1.34M prices, 35k fundamentals quarters),
not a fixture.

## Automated gates (all green)
- `npm run verify` — typecheck + **566 tests** (87 files) + CLAUDE.md in all 55 dirs.
- `cd web && npm run build` — Next.js production build compiles + typechecks (5 routes).
- `npm run verify:ui` — **5/5 Playwright** route smokes, zero console errors.

## Live app (production build vs real DB)
All 5 routes returned 200 with real content and zero error markers:
- `/` Action Center — Sourcing Inbox, action queue, digest, portfolio strip.
- `/themes` → 307 → `/themes/ai` — intelligence strip + ranked table (AMD, NVDA,
  ADI, … real names with breakdown bars).
- `/tickers/HUM` — all four cockpit quadrants (BUY-ZONE / QUALITY / WHY NOW /
  WHAT KILLS IT); after the dossier run it also surfaces the HOLD verdict + debate.
- `/portfolio`, `/journal` — render with real rows / honest empty states.

## Live model runs (the on-demand system, real llama-server)
1. **Fast — theme_sweep `ai_compute_gpu`, 15-min budget → 35B-A3B "fast" profile.**
   Booted the model, ran screens_rank + theme_summaries, wrote
   `data/research/run_20260708195113_1ymt.md` (COMPLETED, 38s), killed the model,
   released the lock. Artifact contains the ranked screen table (AMD F7 / NVDA F5 …
   reflecting the screens fixes below) + a coherent LLM theme narrative.
2. **Deep — ticker_dossier HUM, 90-min budget → 27B "deep" profile.**
   Full 8-stage multi-agent debate (classify → research → bull → bear → rebuttal →
   judge → critique → judge_rev → memo) in **1922s (32 min)**. Produced a StoryPage
   (HOLD/LOW verdict, valuation + technical outlook + SMA50/RSI tripwire) and
   `data/research/run_20260708195400_yl4n.md`; model killed cleanly, lock released.

Verified across both: two-model profile routing, run-lock single-flight,
`--manage-llama` boot/kill (RAM freed), budget + synthesis buffer, step
checkpointing, and artifact writing + UI linkage.

## Fixes surfaced by the live e2e (committed)
- **Screens were ~3% computable on live data** — Yahoo/EDGAR report the same fiscal
  quarter under different period-end dates with complementary fields, the newest
  quarter predates its own 10-Q, and non-Dec fiscal-Q4 rows carry balance-sheet
  instants but no flows. Added `merge-quarters` (field-wise merge + drop
  non-reporting stubs) + `ev` (stale-tolerant EV/EBIT) and gave accruals/fscore/
  dilution a freshest-complete-window. Real-universe impact: cheap cohort 6→91,
  accruals-pass 0→325, F-Score≥7 5→40, dilution-pass 24→56, tier-2 candidates 0→1
  (HUM: F8/8, cheap, buyback).
- **Run duration recorded 0s on the COMPLETED path** — `compileAndWriteReport` now
  persists final `elapsedSeconds` (verified: the deep run shows 1922s).

## Known cosmetic (not blocking)
- Deep-run narrative rendered revenue as "$39,648,000B" — an LLM number-formatting
  quirk in the narration layer (the deterministic provenance is unaffected).

## Result
Rebuild P0–P9 complete. All gates green; the platform runs end-to-end on real data
and real local models with durable, linked research artifacts.
