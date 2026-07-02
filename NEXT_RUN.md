# NEXT_RUN — Integration & Flesh (run 2)

**Mission:** turn the verified skeleton into the working platform. Run 1 built and
tested the deterministic core (185 tests, honest TASKS.md — good). Run 2 adds **zero
new scaffolding**: every task below lands *live-verified* functionality — real data,
real Qwen calls, real UI. If you find yourself writing another interface + fake
instead of wiring a real thing, stop and re-read this file.

**Carry over from run 1 (unchanged):** `npm run verify` green before every commit ·
TASKS.md updated honestly every commit (`[x]`/`[~]`/`[ ]`) · CLAUDE.md in every dir ·
additive migrations only · all invariants in root CLAUDE.md · **no broker code, ever**.

**New honesty rules:**
1. Never call a golden test "vs Python values" unless the number was actually taken
   from Python output. (Fix run 1's TASKS M2.8 label: values are hand-derived —
   correct them or relabel. Also: route count is 8, not 9.)
2. If a preflight or blocker fails, **STOP and report** — do not build more
   mock-driven layers around a missing environment. A short honest run beats a long
   scaffolded one.

---

## Phase 0 — Environment preflight (HARD GATE — do these checks first)

- [ ] 0.1 llama-server healthy: `curl -s http://localhost:8000/health` returns ok and
      `curl -s http://localhost:8000/v1/models` lists `qwen3.6-27b`.
      If down: STOP and tell the user to start it (setup reference:
      `/Users/yash/Desktop/Programming/ResearchEngine/LOCAL_QWEN_SETUP.md` — launchd
      service `com.local.llamacpp`). Do not proceed past Phase 1 without it.
- [ ] 0.2 Network reachable: one `GET https://query1.finance.yahoo.com/v8/finance/chart/MU?range=5d&interval=1d`
      and one `GET https://data.sec.gov/submissions/CIK0000723125.json` (with a
      descriptive `EDGAR_USER_AGENT` from `.env`) both return 200.
- [ ] 0.3 Donor repos present (read-only sources):
      `/Users/yash/Desktop/Programming/finance` (Python brain — prompts, analyzers, screener),
      `/Users/yash/Desktop/Programming/ResearchEngine` (ENGINE — rules engine, jobs, UI patterns),
      `/Users/yash/Desktop/Programming/ResearchApp` (Signal Desk — parser fixtures, prompt contract).
      If absent (headless run), STOP after Phase 1 tasks that don't need them and report.

## Phase 1 — Donor pack: port the SOUL, not just the shape

The run-1 agent prompts are 1–2 line system prompts. The donors have the actual
research quality. Port faithfully, adapting only for TS/zod.

- [ ] 1.1 **Rich agent prompts.** Create `src/dossier/prompts/` with one module per
      agent, porting the full prompt text and rubrics from
      `finance/analysis/agents/{planner,bull,bear,bull_rebuttal,judge,self_critique,memo_synth}.py`.
      Non-negotiables: judge's conviction rubric (HIGH = multiple independent supports
      + bear addressed with evidence + falsifiability clear; MEDIUM = ≥1 bear argument
      unresolved; LOW = research flag, not capital) and the full verdict field
      guidance; bear must both ATTACK the bull case and build an INDEPENDENT bear
      case; memo_synth must know the 10 Living Memo sections. Keep the existing zod
      schemas; only the prompts get richer. Wire `agents.ts` to import from `prompts/`.
- [ ] 1.2 **Sector analyzer depth.** Flesh `src/dossier/analyzers.ts` KPI templates
      from `finance/analysis/analyzers/*.py` (SaaS: ARR/NRR/Rule-of-40; banks:
      NIM/efficiency/ROTCE; REITs: FFO/AFFO/occupancy; biotech: pipeline/PDUFA/runway;
      semis, energy, consumer, generic) — the promptPrefix per sector should carry
      those KPI checklists.
- [ ] 1.3 **Universe CSV.** Copy `finance/analysis/sp500_analysis.csv` →
      `config/sp500.csv` (keep ticker/company/sector/industry columns). Extend
      `scripts/seed.ts`: seed all 503 S&P tickers mapped to GICS codes + the 131
      AI-infra tickers from `ResearchEngine/config/sectors.ts` with their sector links
      (dedupe overlap; AI-infra membership is additive to GICS membership).
- [ ] 1.4 **Tripwire rules engine.** Port `ResearchEngine/lib/rules/engine.ts` +
      `config/tripwires.ts` (6 rules, injectable context, cooloff, ack) into
      `src/rules/`; store fired events (RuleEvent table exists in schema); synthesize's
      `tripwire` family reads real fired events instead of injected fixtures.
- [ ] 1.5 **Missing synthesize families.** Add `credit` (HYG/IEF proxy), `catalysts`
      (upcoming window), `data_health` (stale prices / failed jobs / suspect ticks)
      families to `src/research/synthesize.ts`, matching ENGINE's semantics
      (`ResearchEngine/lib/research/synthesize.ts`). Provenance string on every insight.
- [ ] 1.6 **Capture contract fidelity.** Copy Signal Desk's full OUTPUT_FORMAT text
      (`ResearchApp/lib/seed-prompts.ts`) into `src/capture/render.ts` and port its
      parser fixtures (`ResearchApp/tests/parser.test.ts`) into `src/capture/` tests.

## Phase 2 — Real universe, real backfill, real digest

- [ ] 2.1 Migrate + seed full universe (503 + 131, dedup) → verify counts via sqlite3.
- [ ] 2.2 Live backfill: `prices10y` (10y daily bars, conc ≤3, ~2 req/s), then
      `fundamentals` (quarterly), then `edgar_index` (CIKs + submissions, ≤8 req/s).
      Resumable via BackfillProgress. **Verify:** `Price` ≥ 1.2M rows; spot-check 3
      symbols vs Yahoo web; `BackfillProgress` all done; interrupted rerun = no dupes.
- [ ] 2.3 New jobs (never-crash, catch-per-item): `stats` (daily batched quote(), 100
      symbols/req), `news` (Google News RSS per AI-infra sector query + watchlist
      tickers — port `ResearchEngine/lib/jobs/news.ts`), `earnings` (calendarEvents →
      Catalyst rows). Register all in the job runner; each exposed via scripts.
- [ ] 2.4 Overnight chain: prices-heal → stats → news → earnings → rules → digest,
      persisted. **Verify:** run it live; digest row exists for today, ≥4 families
      present with real provenance; runtime < 12 min.

## Phase 3 — Live Qwen (first real research)

- [ ] 3.1 Dossier smoke: run the full debate on MU end-to-end against llama-server.
      Persist every stage + tokens + wall-clock. **Verify:** verdict validates against
      the schema; RecCall written with governed size; total wall-clock recorded.
- [ ] 3.2 Tune from evidence: if any stage failed JSON twice or total > 60 min, adjust
      (per-stage maxTokens, evidence caps, prompt tightening) and rerun. Record
      before/after numbers in TASKS.md.
- [ ] 3.3 Digest narration + story narration live (thinking OFF roles). Verify prose
      lands and pages render without it too.
- [ ] 3.4 Run dossiers on 2 more tickers from different GICS sectors (one AI-infra,
      one not) to exercise analyzer routing.

## Phase 4 — UI to daily-driver parity (web/)

Wire everything through the tested data layer (`src/db/queries.ts`) — no direct SQL in
components. Add `recharts` to web/. Match the editorial aesthetic of the user's
hand-built Micron page (Space Grotesk-style display type, stat tape, cycle strip,
dark/light via CSS custom properties).

- [ ] 4.1 `/` = the morning read: latest digest hero (headline, narration, ranked
      insights with provenance, per-family sections), links everywhere.
- [ ] 4.2 `/dossiers` live queue/history + `/dossiers/[id]` detail: stage timeline
      with 3s polling, debate transcript accordion (bull/bear/rebuttal/judge/critique),
      evidence table (tool calls + confidence), verdict card with trade plan +
      falsifiability list. Queue-dossier button (writes a queued row).
- [ ] 4.3 `/tickers/[symbol]`: price chart (despiked, recharts), stats, filings,
      news, dossier history, memo link.
- [ ] 4.4 `/memos/[symbol]`: 10 sections, version history, staged-delta review with
      human Apply/Reject.
- [ ] 4.5 `/story/[id]` full flagship: KPI tape (≥4 stats w/ evidence refs), cycle
      strip with stage bands, **evidence charts from frozen series** (revenue bars,
      margin lines, quarterly ramp), scenario estimator (exists — keep), callouts,
      honest footnotes, archived list at `/story`.
- [ ] 4.6 `/capture`: template picker → rendered prompt w/ injected local data →
      copy → paste box → parse preview grouped by kind → per-item accept → commit
      (EvidenceItems + DiscoveryCandidates + Catalysts).
- [ ] 4.7 `/buylist`: month draft (ranked, governed sizes over $2,500, cash residual,
      rationale + governor reason per row) → finalize → log-buy per item
      (actualUsd/actualPrice/date → JournalEntry). `/calibration`: favorable rate by
      tier/action, due-outcome review, governor status per tier.
- [ ] 4.8 `/screener` live over local data + saved configs; `/discovery` queue
      accept/reject.
      **Verify each route:** `next build` green AND a manual `next dev` walkthrough —
      screenshot or DOM-text evidence per route in TASKS.md.

## Phase 5 — Daemon reality

- [ ] 5.1 Scheduler loop mode: cron-like ticks + `shouldCatchUp` wiring to the real
      overnight chain + dossier-queue drain when idle (single-flight respected).
- [ ] 5.2 Live wake test: sleep the Mac ≥5 min mid-day, wake → catch-up fires once,
      digest guard prevents duplicates. Record JobRun evidence.
- [ ] 5.3 `deploy/install-launchd.sh` (copy plist → `~/Library/LaunchAgents`,
      bootstrap, logs under `data/logs/`), backup job (`VACUUM INTO data/backups/`,
      keep 14) + pre-migration snapshot.

## Phase 6 — Acceptance (the whole point)

- [ ] 6.1 End-to-end, all live, documented with evidence in TASKS.md:
      laptop opens → digest ready ≤10 min covering full market → queue MU dossier from
      digest → full debate completes ≤60 min → story page renders with charts +
      working sliders → buy-list draft allocates $2,500 with governed sizes →
      log a (paper) buy → outcome job schedules horizons → calibration page shows it.

---

## Donor file map (read-only)

| Need | Source |
|---|---|
| Agent prompts + judge rubric | `finance/analysis/agents/*.py` |
| Sector KPI templates | `finance/analysis/analyzers/*.py` |
| Orchestration semantics | `finance/analysis/agent_loop.py` |
| Screener semantics | `finance/analysis/screener_engine.py` |
| S&P 500 CSV | `finance/analysis/sp500_analysis.csv` |
| Tripwires + rules engine | `ResearchEngine/lib/rules/`, `config/tripwires.ts` |
| Synthesize families reference | `ResearchEngine/lib/research/synthesize.ts` |
| News/earnings jobs | `ResearchEngine/lib/jobs/{news,earnings}.ts` |
| AI-infra taxonomy (131 tickers) | `ResearchEngine/config/sectors.ts` |
| Qwen serving reference | `ResearchEngine/LOCAL_QWEN_SETUP.md` |
| Capture contract + parser fixtures | `ResearchApp/lib/seed-prompts.ts`, `ResearchApp/lib/parser.ts`, `ResearchApp/tests/` |
| Flagship page reference | `docs/reference-micron.html` (the user's hand-built Micron page — replicate tape/strip/charts/estimator/footnotes with recharts) |

## Definition of done for run 2

All Phase 0–6 boxes `[x]` with live evidence, or an early honest STOP report naming
the exact blocker. No new `[~]`-forever items: anything started gets finished live or
reverted.
