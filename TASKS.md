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
- [x] M0.10 **Thinking-contract hardening** (live-verified vs llama.cpp/Qwen Jul 2):
  per-call `chat_template_kwargs.enable_thinking` on toggle-capable profiles;
  `response_format` only on non-thinking calls (grammar inactive during thinking);
  empty-content+reasoning → `ThinkingBudgetExhausted` (non-connectivity) →
  `completeJson` auto-downgrades to no-think once; `reasoningChars` recorded —
  _7 new tests; live probe `scratch/check-live-provider.ts`: downgrade fired &
  recovered (attempts:1), budgeted run reasoningChars=3141_

## M1 — Full market: universe, backfill, generalized digest, scheduling
- [x] M1.1 Dual-taxonomy sector seeds (GICS 11 + AI-infra 12) in `config/sectors.ts`
- [x] M1.2 `prisma/schema.prisma` (30 models) + `migrations/0001_init.sql` — validated with `npx prisma validate`
- [~] M1.3 `lib/universe.ts` CSV→GICS mapping + **`scripts/seed.ts`** (dual-taxonomy sectors
  + demo tickers + links + sample digest — verified against a real DB, 23 sectors/5 tickers)
  done & tested; loading the full 503-row `sp500.csv` is a data-copy step
- [~] M1.4 Backfill orchestration (resumable + catch-per-item), Yahoo/EDGAR **parsers**
  (`parseChart`/`parseQuoteBatch`/`parseSubmissions`), **and fetch wrappers**
  (`fetchChart`/`fetchSubmissions` over an injectable fetcher, mock-tested incl. EDGAR UA +
  limiter) all done & tested; only the live external endpoints are unexercised _(external)_
- [x] M1.5 Generalized synthesis families (market breadth / GICS pulse / AI-lens) + hard caps + provenance — see `src/research/`
- [~] M1.6 Quote-batch parsing done & tested (`parseQuoteBatch`); daily stats job wiring pending _(live-service)_
- [~] M1.7 Scheduler decision logic + **daemon skeleton** (`scripts/scheduler.ts --once`
  runs a verifiable single tick) + **launchd plist** (`deploy/com.engine.scheduler.plist`);
  the long-lived loop wiring to live jobs is runtime

## M2 — Tool registry + evidence primitives + screener + discovery
- [x] M2.1 `ToolResult` + never-throw `execute` wrapper + in-memory `EvidenceLedger` + `evidencePrompt`
- [x] M2.2 `Budget` (wall-clock + call-count caps, USD removed)
- [x] M2.3 Tool cache (`tool:sha1(args)` keys)
- [x] M2.4 Tool registry + `toolsPromptCatalog()`
- [x] M2.5 Port `dcf` (3-scenario) — golden test
- [x] M2.6 Port `financial_trends` (8–12q trajectory)
- [x] M2.7 Port `technicals` math (RSI/MACD/SMA/golden-cross/52w) over despiked closes
- [x] M2.8 Port `qoe_forensics` (Beneish/Altman/Piotroski/accruals) — golden tests, hand-derived values
- [x] M2.9 Port `relative_rank` (percentiles/spotlight) + `sector_heat` (both taxonomies)
- [~] M2.10 All network/analysis tool logic done & tested — `sentiment`, `news-tape`,
  `macro` (regime), `peer-compare`, `catalysts`, `insider-form4` (XML parse + cluster-buy),
  `institutional` (ownership), `options-metrics` (P/C, ATM IV), EDGAR limiter (≤8 req/s
  **proven**) + submissions parser, Yahoo `parseChart`/`parseQuoteBatch`; live fetch wrappers pending _(live-service)_
- [x] M2.11 Screener engine + field resolvers + universe spec (sp500|ai_infra|watchlist|sector:code)
- [x] M2.12 Discovery candidate lifecycle (observe/decide/promote → watchlisted ticker) — pure logic done & tested (`src/discovery`)

## M3 — Dossier engine (queued full-debate deep dives)
- [x] M3.1 `Budget` + `evidence-validation` (drop uncited claims — "no naked numbers")
- [x] M3.2 Agent zod schemas (planner/bull/bear/rebuttal/judge/critique/memoSynth) — judge verdict contract verbatim
- [x] M3.3 Agent modules driven by `completeJson` (thinking on/off by role)
- [x] M3.4 `classify()` router + 8 sector analyzers (data objects)
- [x] M3.5 Resumable runner (plan→tools→bull→bear→rebuttal→judge→critique→memo) — reuse done stages, rebuild ledger, stale→queued
- [x] M3.6 Judge HOLD/LOW fallback (never crash)
- [x] M3.7 Queue + dedupe + drain-when-idle
- [x] M3.8 Tests: happy path · resume-after-bear · budget exhaustion · uncited-claim drop · malformed-judge fallback
- [ ] M3.9 Live smoke on Qwen (`job dossier --symbol=MU`) — **BLOCKED this session**: llama-server not reachable at localhost:8000 (probed → NO_HEALTH). The full pipeline is FakeProvider-tested + `HttpProvider` is mock-tested; only the live round-trip needs a running server.
- [~] M3.10 Dossier UI — `web/app/dossiers` list route renders + `next build` passes; a
  `/live` route reads the real digest from SQLite at request time (the live-data-wiring
  pattern); live stage-polling + memo apply pending

## M4 — Story pages (flagship)
- [x] M4.1 `story/schema.ts` zod `StoryPageData`
- [x] M4.2 `story/build.ts` deterministic composer (frozen snapshot) + scenario math — golden test vs Micron numbers
- [~] M4.3 Story components — hero, stat tape, cycle strip, **client scenario estimator** (recomputes impliedPrice) render + `next build` passes (`web/app/story/[id]`); recharts evidence charts deferred
- [~] M4.4 `narrate.ts` — narration logic done & **FakeProvider-tested** (thinking OFF,
  page renders without it); only the live Qwen prose call is blocked (no server) _(external)_

## M5 — Buy-list ritual + calibration governor
- [x] M5.1 `calibration/governor.ts` verbatim (CAP 2.0 / MIN 5 / FAVORABLE 0.5; favorable-per-action) — tests replicate Python cases
- [x] M5.2 `calibration/outcomes.ts` horizon math (1m/3m/6m/1y from local closes)
- [x] M5.3 `buylist/build.ts` allocation (rank, min(judge,governed) size, $2500, min lot $100, residual→cash) — tests
- [~] M5.4 Buy-list UI — `web/app/buylist` renders governed allocation + cash + `next build` passes; calibration page + log-buy→JournalEntry pending

## M6 — Paste-capture channel
- [x] M6.1 `capture/parse.ts` (JSON-block + legacy fallback) — tests on Signal Desk-style fixtures
- [x] M6.2 `capture/theme-map.ts` (theme slugs → Sector codes)
- [x] M6.3 `capture/render.ts` (4 prompt templates + local-data injection)
- [~] M6.4 Capture UI — `web/app/capture` renders a real prompt template + `next build` passes; paste-back parse→commit pending

## NEXT_RUN — Rich agent prompts + sector analyzer depth
- [x] 1.1 Rich agent prompts ported from `finance/analysis/agents/*.py` into
  `src/dossier/prompts/` (planner/bull/bear/rebuttal/judge/critique/memo), each exporting
  `system` + a typed `user(...)` builder; `agents.ts` rewired to import them (no signature
  or schema changes). Judge carries the verbatim HIGH/MEDIUM/LOW conviction rubric +
  `what_would_change_mind`; bear demands attack + independent case; memo names all 10 Living
  Memo sections — _verified: `prompts.test.ts` (13 assertions) green; `tsc --noEmit` clean_
- [x] 1.2 Sector analyzer KPI depth — all 8 `analyzers.ts` `promptPrefix` strings fleshed
  with the donor's sector KPI checklists + good-ranges (SaaS ARR/NRR/Rule-of-40/magic;
  banks NIM/efficiency/Tier-1/ROTCE; REITs FFO/AFFO/occupancy/WALT; biotech
  pipeline/PDUFA/runway; semis/energy/consumer/generic equivalents); `requiredTools` mapped
  to real TS registry names (no live transcripts/alt-data) — _verified: `validation-classify.test.ts`
  green; `check:claude` covers `src/dossier/prompts/`_
- [x] 1.2b Living-Memo context threaded to planner + judge (donor fidelity fix from the
  batch-A audit): `memoSummary` flows RunnerDeps → AgentCtx → prompts, "(no prior memo)"
  fallback — _+3 prompt tests_
- [x] 1.3 Full universe: `config/sp500.csv` (503 rows, all GICS-mapped) + `AI_INFRA_TICKERS`
  union of both donor taxonomies → **seeded 563 tickers / 23 sectors / 641 links,
  idempotent** on the real DB. NOTE: original gate said ≥600/≥700 — spec arithmetic error
  (71 of 131 AI names are S&P members; dedupe ⇒ 563/640); faithfulness chosen over the
  number. Donor sub-sectors folded: grid/cooling/power→`ai_power`, servers→`ai_data`,
  robotics/drones→`ai_edge`; `ai_models`/`ai_software` seeded empty (no donor constituents)
- [x] 1.4 Tripwire rules engine ported (`src/rules/` + `src/config/tripwires.ts`, 6 rules):
  pure evaluators, cooloff, capex-raise suppression, despiked reads; fires persist as
  RuleEvent rows — _26 tests_. **Schema drift found & fixed:** RuleEvent was in neither
  schema.prisma nor 0001_init (run-1 claim wrong); runtime guard added by batch B +
  proper `0002_rule_event.sql` migration + schema model (31 models, prisma validate ✅)
- [x] 1.5 Synthesize families added: `credit` (−5 warn/−10 critical), `catalysts`
  (7-day window; donor used 10), `data_health` (stale age/count, suspect ticks, failed
  jobs); provenance on every insight; existing families untouched — _+4 tests_
- [x] 1.6 Capture contract fidelity: full donor OUTPUT_FORMAT (10 arrays, enum vocab,
  1–5 confidence, mandatory discoveries, shape example, retargeted to `ai_*` slugs) +
  faithful `parseResearchOutput` (fenced-JSON primary, legacy SIGNAL_DESK pipe fallback);
  donor parser fixtures ported — _+8 tests_. Existing `parseCapture` contract intact.

_Suite after Phase 1: **253 tests / 43 files**, CLAUDE.md 42/42, tsc clean, seed
idempotent. Known nit: `npm run seed` appends a sample digest each run (digest count
grows); make it create-if-absent in the live-data batch (FIXED in batch C)._

## Phase 2 — LIVE data runs (evidence, Jul 3 2026)
- [x] 2.1 `edgar_index` LIVE: **554/554 symbols, 0 errors, 389,499 filings in 107.5s**
  (303,526 Form 4 · 61,650 8-K · 14,492 10-Q · 4,890 10-K · 4,941 DEF 14A);
  9 symbols without CIKs are benchmarks/ETFs. Required the job-CLI .env fix (faf8345).
- [x] 2.2 `prices10y` LIVE: **1,343,110 rows · 558/563 symbols · 2016-06-27→2026-07-02
  in 412s** (yahoo-finance2 session; the naive-fetch 429 wall never appeared).
  5 persistent failures (ANSS, DAY, HOLX, MMC, PSTG) = stale/delisted Jan-2026 CSV
  constituents — fail on both route legs, retried once; left as `error` rows so
  `data_health` surfaces them; universe refresh will deactivate them properly.
- [x] 2.3 `fundamentals` LIVE: **563/563, 0 errors, 3,379 quarter-rows / 556 symbols
  in 464s**. HONEST CAVEAT: Yahoo's free quarterly window is ~6-8 quarters/symbol,
  not the hoped ~5y (MU: 7). Deepening via annual series = backlog.
- [x] 2.4 `overnight` chain LIVE: **6/6 jobs, 54.3s** — 2,224 bars healed, 556 stats,
  962 news, 126 catalysts, live tripwire fire (SNDK −25% warn), digest persisted.
  After batch E: regenerated digest 2026-07-03 = **16 insights** across 8 families.

## Phase 3 — FIRST LIVE DOSSIER (evidence, Jul 3 2026)
- [x] 3.1 `npm run job -- dossier --symbols=MU` end-to-end on local Qwen: **9 stages,
  AVOID/LOW verdict, governed RecCall persisted.** Timings: research 234s (planner+
  tools over real data), bull 210s, bear 296s, rebuttal 279s, judge 277s, critique
  353s, judge_rev 418s, memo 111s. Run 1 died at judge+301s → root cause: undici's
  default 300s fetch timeout killed any LLM call >5min (server was healthy; client
  cancel in llamacpp.log) → fixed (profile.timeoutMs → undici dispatcher).
  **Resume proven live**: requeued failed run reused all 6 persisted stages at 0.0s
  and completed critique→memo in 882s.
- [x] 3.2 Research quality audit: initial judge = BUY/MEDIUM (targets 1150–1250,
  every claim citing real tool evidence, 0 dropped claims, 3 numeric falsifiability
  conditions). Risk-officer critique caught real flaws (high-confidence bull claims
  lacking FCF-trend evidence; entry at 852 contradicting a BUY) → revision to
  **AVOID/LOW size 0 ("forward-earnings value trap"), with concrete re-entry
  triggers.** The debate discipline works as designed; both verdicts preserved in
  stage history.
- [x] 3.3 Bug fixed from the run: stale `state.error` survived a successful resume
  (runner now clears it on start). KNOWN ISSUE → next batch: sector router classified
  MU as `generic` (should be `semis` — analyzer KPI framing lost). **FIXED + verified
  live in 3.4.**
- [x] 3.4 SECOND dossier (NVDA, Jul 3) — full-platform validation in one run:
  sector resolved → `ai_compute_gpu` (semis analyzer framing ✓ router fix live);
  **10 stages incl. the automatic `story` stage** (page: "NVDA: Semiconductors /
  Hardware — HOLD/MEDIUM"); judge 3% → **governor 2%** with the earned-trust
  rationale (first non-zero governed size); critique let the verdict stand (no
  systematic revision bias); 2,294s total, all >300s stages surviving the timeout
  fix. RecCalls now: MU AVOID/LOW 0%, NVDA HOLD/MEDIUM 2%.

## Phase 5 — Daemon reality (evidence, Jul 3 2026)
- [x] 5.1 Scheduler daemon LIVE (detached, ticking 60s, heartbeats, idle dossier-queue
  drain, llama watchdog). launchd assets ready (`deploy/`) but **blocked by macOS TCC**
  (launchd agents can't read ~/Desktop; stack-sampled `open$NOCANCEL` hang) →
  WORKAROUND: granted-shell detached process. Permanent fix is user-gated (node Full
  Disk Access, or move the repo) → WELCOME_BACK.
- [x] 5.2 **Wake detection verified live**: SIGSTOP the tsx WORKER (three prior
  attempts froze the zsh wrapper / tsx parent — the process tree is
  wrapper→cli→worker; only the worker's event loop matters) for 200s → thaw →
  "[scheduler] wake detected (long inter-tick gap) → catch-up evaluation" logged,
  same-date digest guard short-circuited the chain correctly.
- [x] 5.3 saveDigest upsert-by-date; daily VACUUM backups (keep 14) wired into the
  morning chain. NEXT ACCEPTANCE: tomorrow's 05:00+ window should produce the first
  fully AUTONOMOUS morning digest (no human, no CEO command).

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

## Environment blockers (cannot be verified in this headless session)

Every remaining `[ ]`/`[~]`-with-"external" item requires a live host. The LOGIC behind
each is implemented and tested (FakeProvider / mocked fetch / real node:sqlite); only the
live I/O is unexercised. Documented, not faked:

- **Live Qwen** (M3.9 smoke, M4.4 prose) — needs `llama-server` at `localhost:8000`,
  re-probed every iteration → `NO_HEALTH`. Unblock: start the server, then
  `npm run job dossier -- --symbol=MU`. Proxy verified: full pipeline runs on
  `FakeProvider`; `HttpProvider` mock-tested; `completeJson` retry tested; `narrate` tested.
- **Live Yahoo/EDGAR round-trips** — external rate-limited services. Unblock: run on a
  networked host. Proxy verified: `parseChart`/`parseQuoteBatch`/`parseSubmissions` +
  `fetchChart`/`fetchSubmissions` (injectable fetcher) fixture/mock-tested; EDGAR ≤8 req/s
  limiter proven.
- **Browser-rendered UI correctness** — needs a browser. Proxy verified: `next build`
  compiles + type-checks all 8 routes against the engine; `/live` reads the real SQLite
  digest via the tested data layer.
- **Long-lived scheduler daemon** — a persistent process. Proxy verified:
  `scripts/scheduler.ts --once` runs one decision tick; `src/schedule/wake` unit-tested;
  launchd plist in `deploy/`.

## Verification evidence (last run)

- `tsc --noEmit` → exit 0 (clean).
- `vitest run` → **185 passed** across 39 files — incl. the end-to-end
  `pipeline.integration.test`, SQLite-backed dossier persist+resume, a real-migrated-DB
  **data-access layer** test (prices/despike, digest, RecCalls→governor) + **seed helpers**
  (23 sectors / tickers / links), Yahoo/EDGAR **fetch wrappers** (mocked fetcher),
  5 dossier-runner scenarios, QoE/DCF/governor golden, EDGAR limiter ≤8 req/s,
  Form 4 + cluster-buy, options/institutional/macro/peer/catalysts, scheduler decisions,
  HTTP transport, migration runner, sentiment/news-tape/discovery.
- `npm run smoke` → **SMOKE PASSED**; `scripts/scheduler.ts --once` → exit 0;
  `npm run seed` → 23 sectors / 5 tickers / 9 links / 1 digest into a real SQLite DB.
- `npx prisma validate` → schema valid (30 models).
- `next build` (web/) → **compiled + type-checked** against the engine, **8 routes** incl.
  `/live` which reads the real SQLite digest at request time via the tested data layer.
- `tsx scripts/apply-migration.ts` → applies `0001_init.sql` to a real SQLite DB (WAL);
  `migrate.test.ts` confirms all 30 tables materialize, idempotency, and insert/read-back.
- `scripts/check-claude-md.ts` → CLAUDE.md present in all 35 directories (core + web + deploy).
- `git log` → 20 commits at regular milestone boundaries.
