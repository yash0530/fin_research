# ENGINE Unification — Master Task Checklist

Single source of truth for the build. Every task has a checkbox and a verification
method. This file is updated in **every commit** to reflect true state.

**Legend:** `[x]` done & verified · `[~]` scaffolded (interface + tests via fakes, live adapter pending) · `[ ]` not started

**Verification gate:** `npm run verify` = `tsc --noEmit` clean + `vitest` green + CLAUDE.md coverage.

**Status (verified):** deterministic core **COMPLETE & VERIFIED** — `npm run verify` green
(tsc clean · 119 tests across 22 files · CLAUDE.md in all 18 dirs · Prisma schema valid,
30 models). Live-service adapters (Qwen/Yahoo/EDGAR HTTP) + Next.js UI: interfaces defined
and tested with fakes/mocks; wiring to live I/O is the remaining integration work (marked below).

---

## Phase 0 — Repo & toolchain
- [x] 0.1 Create `fin_research`, `git init` — _verified: `git status` clean tree_
- [x] 0.2 `package.json` (zod, vitest, tsx, typescript), `tsconfig`, `tsconfig.build`, `vitest.config`, `.gitignore` — _verified: `npm install` 50 pkgs in 5s_
- [x] 0.3 Prove toolchain with a passing test — _verified: 25 tests green, tsc exit 0_
- [x] 0.4 CLAUDE.md coverage checker (`scripts/check-claude-md.ts`) wired into `npm run verify`

## M0 — Foundation & safety seams
- [x] M0.1 `jsonsafe` + `jsonsafeArray` (weak-model JSON salvage) — _6 tests_
- [x] M0.2 Provider abstraction (`Provider`, `LlmMessage`, `LlmResult`, `ProviderError`)
- [x] M0.3 `FakeProvider` (scripted, records calls — drives all engine tests)
- [x] M0.4 `completeJson()` harness (jsonsafe → zod → retry-with-validation-error) — _5 tests_
- [x] M0.5 Per-endpoint keyed `withLlmLock` (serialize same endpoint, concurrent across endpoints) — _3 tests_
- [x] M0.6 `despike` + metrics (rolling-median bad-tick filter, multi-day block safe) — _7 tests_
- [x] M0.7 Provider profiles w/ `contextWindow` + `thinkingMode`; Gemma seam documented
- [x] M0.8 Per-role model routing (`default` + sparse `overrides`) + thinking-by-role — _4 tests_
- [x] M0.9 Live HTTP provider (`openai_compat` + `anthropic`) via `HttpProvider` — injectable fetch, `ProviderError` on non-2xx/network failure; tested with mocks + end-to-end through completeJson

## M1 — Full market: universe, backfill, generalized digest, scheduling
- [x] M1.1 Dual-taxonomy sector seeds (GICS 11 + AI-infra 12) in `config/sectors.ts`
- [x] M1.2 `prisma/schema.prisma` (30 models) + `migrations/0001_init.sql` — validated with `npx prisma validate`
- [~] M1.3 `lib/universe.ts` CSV → GICS mapping (done + tested); seed script + `sp500.csv` data file pending _(app/data layer)_
- [~] M1.4 Backfill orchestration — resumable (skip-done) + catch-per-item done & tested (`src/jobs/backfill`, `src/jobs/runner` chain); live Yahoo/EDGAR `fetchOne` impls pending _(live-service)_
- [x] M1.5 Generalized synthesis families (market breadth / GICS pulse / AI-lens) + hard caps + provenance — see `src/research/`
- [ ] M1.6 Stats split (daily batched quote) _(live-service)_
- [ ] M1.7 6am `node-cron` + manual "Run morning" trigger _(needs scheduler/UI)_

## M2 — Tool registry + evidence primitives + screener + discovery
- [x] M2.1 `ToolResult` + never-throw `execute` wrapper + in-memory `EvidenceLedger` + `evidencePrompt`
- [x] M2.2 `Budget` (wall-clock + call-count caps, USD removed)
- [x] M2.3 Tool cache (`tool:sha1(args)` keys)
- [x] M2.4 Tool registry + `toolsPromptCatalog()`
- [x] M2.5 Port `dcf` (3-scenario) — golden test
- [x] M2.6 Port `financial_trends` (8–12q trajectory)
- [x] M2.7 Port `technicals` math (RSI/MACD/SMA/golden-cross/52w) over despiked closes
- [x] M2.8 Port `qoe_forensics` (Beneish/Altman/Piotroski/accruals) — golden tests vs Python values
- [x] M2.9 Port `relative_rank` (percentiles/spotlight) + `sector_heat` (both taxonomies)
- [ ] M2.10 Network tools (fundamentals live-fill, sentiment, news_tape, edgar_filings, insider_form4, institutional, options) _(live-service)_
- [x] M2.11 Screener engine + field resolvers + universe spec (sp500|ai_infra|watchlist|sector:code)
- [ ] M2.12 Discovery candidate accept→watchlist flow _(DiscoveryCandidate model in schema; accept-flow needs the app layer)_

## M3 — Dossier engine (queued full-debate deep dives)
- [x] M3.1 `Budget` + `evidence-validation` (drop uncited claims — "no naked numbers")
- [x] M3.2 Agent zod schemas (planner/bull/bear/rebuttal/judge/critique/memoSynth) — judge verdict contract verbatim
- [x] M3.3 Agent modules driven by `completeJson` (thinking on/off by role)
- [x] M3.4 `classify()` router + 8 sector analyzers (data objects)
- [x] M3.5 Resumable runner (plan→tools→bull→bear→rebuttal→judge→critique→memo) — reuse done stages, rebuild ledger, stale→queued
- [x] M3.6 Judge HOLD/LOW fallback (never crash)
- [x] M3.7 Queue + dedupe + drain-when-idle
- [x] M3.8 Tests: happy path · resume-after-bear · budget exhaustion · uncited-claim drop · malformed-judge fallback
- [ ] M3.9 Live smoke on Qwen (`job dossier --symbol=MU`) _(live-service)_
- [ ] M3.10 Dossier + memo UI (Next.js) _(UI layer)_

## M4 — Story pages (flagship)
- [x] M4.1 `story/schema.ts` zod `StoryPageData`
- [x] M4.2 `story/build.ts` deterministic composer (frozen snapshot) + scenario math — golden test vs Micron numbers
- [ ] M4.3 React components (KPI tape, cycle strip, evidence charts, scenario estimator) _(UI layer)_
- [ ] M4.4 `narrate.ts` Qwen prose (page renders without it) _(live-service)_

## M5 — Buy-list ritual + calibration governor
- [x] M5.1 `calibration/governor.ts` verbatim (CAP 2.0 / MIN 5 / FAVORABLE 0.5; favorable-per-action) — tests replicate Python cases
- [x] M5.2 `calibration/outcomes.ts` horizon math (1m/3m/6m/1y from local closes)
- [x] M5.3 `buylist/build.ts` allocation (rank, min(judge,governed) size, $2500, min lot $100, residual→cash) — tests
- [ ] M5.4 Buy-list + calibration UI (log buy → JournalEntry) _(UI layer)_

## M6 — Paste-capture channel
- [x] M6.1 `capture/parse.ts` (JSON-block + legacy fallback) — tests on Signal Desk-style fixtures
- [x] M6.2 `capture/theme-map.ts` (theme slugs → Sector codes)
- [x] M6.3 `capture/render.ts` (4 prompt templates + local-data injection)
- [ ] M6.4 Capture UI + commit → EvidenceItem/DiscoveryCandidate/Catalyst _(UI layer)_

## Documentation & housekeeping
- [x] D.1 `TASKS.md` master checklist (this file)
- [x] D.2 Root `README.md`
- [x] D.3 `CLAUDE.md` in every directory (enforced by `npm run check:claude`)
- [x] D.4 `docs/dev_guide.md`
- [x] D.5 `docs/user/` — fully detailed user docs (getting started, daily workflow, dossiers, buy-list ritual, capture, FAQ)
- [x] D.6 Regular git commits (see `git log`)

---

## Out of v1 (deferred by design)
Auto sleep-gap wake-detector · portfolio/thesis monitoring surfaces · true earnings-call
transcripts (8-K fallback ships) · Google Trends · exotic chart patterns · paid data
providers (config-only later) · push notifications · **broker integration (never)**.

## Notes on scope
Tasks marked `[~]` / `[ ] (live-service)` / `[ ] (UI layer)` require a running
llama-server, live Yahoo/EDGAR network, or the Next.js runtime — their logic is
implemented and tested behind interfaces here; wiring them to live I/O is the
remaining integration work, tracked honestly above.

---

## Verification evidence (last run)

- `tsc --noEmit` → exit 0 (clean).
- `vitest run` → **137 passed** across 26 files (incl. 5 dossier-runner scenarios, QoE
  golden M=−2.3735 / Z=4.455 / F=8, DCF closed-form, governor cap/lift, buy-list
  allocation, capture parse, HTTP transport, migration runner, job chain + backfill).
- `npx prisma validate` → schema valid (30 models).
- `tsx scripts/apply-migration.ts` → applies `0001_init.sql` to a real SQLite DB (WAL);
  `migrate.test.ts` confirms all 30 tables materialize, idempotency, and insert/read-back.
- `scripts/check-claude-md.ts` → CLAUDE.md present in all 21 directories.
- `git log` → 11 commits at regular milestone boundaries.
