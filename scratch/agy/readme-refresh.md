# agy batch — Root README refresh

## Intent
The root README.md still describes the run-1 skeleton. Rewrite it as the front door
of a LIVE platform. Same honest voice as CLAUDE.md. ~120 lines max.

## Verified facts (write ONLY from these + existing docs)
- One-paragraph identity: personal local-first investing research engine; unifies
  Edge Terminal · Signal Desk · ENGINE; $2,500/month real capital; research not
  advice, no broker code ever; ≈$0/month operating cost (local Qwen 3.6 27B +
  free APIs).
- LIVE today: 563-ticker dual-taxonomy universe · 1.34M-row 10y Price · 389k EDGAR
  filings · quarterly fundamentals · nightly overnight chain (prices→stats→news→
  earnings→tripwires→digest, 16-insight morning digest) · multi-agent dossiers on
  local Qwen (planner→tools→bull→bear→rebuttal→judge→critique→memo→story) with
  citation enforcement + calibration governor (2% cap till earned) · flagship
  editorial story pages · web UI (morning read, digests, dossiers, tickers,
  calibration, buylist, story).
- Quickstart: npm install · npm run seed · backfills (edgar_index, prices10y,
  fundamentals) · npm run job -- overnight · npm run job -- dossier --symbols=MU ·
  cd web && npm run dev. Gate: npm run verify (348 tests).
- Pointers: docs/architecture.md (diagrams) · docs/user/ (guides) ·
  docs/research/market-scan.md · TASKS.md (build ledger + honest limits) ·
  EXEC_PLAN.md (ops log).
- Requirements: macOS + Node 22+ · llama-server with Qwen 3.6 27B at :8000
  (see ResearchEngine donor's LOCAL_QWEN_SETUP.md path in docs) · EDGAR_USER_AGENT.

## Constraints
Root README.md ONLY (+ ## Result here). No invented commands/claims. Sequential.

## Gates
npm run check:claude green (unchanged). Do NOT commit.

## Result
The root README.md has been rewritten successfully to reflect the LIVE status of the platform in under 120 lines, using only verified facts and maintaining the honest voice. All verification checks and CLAUDE.md gates are passing.
