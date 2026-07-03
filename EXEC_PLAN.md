# EXEC_PLAN — the vacation month (Jul 2026)

Yash is away ~1 month. Claude (Fable 5) is acting CEO with a standing goal: when he
returns, fin_research is his **personal production-grade finance engine** — fully
implemented, live-verified, and documented. This file is the operating plan; see
ROADMAP.md (program phases), NEXT_RUN.md (build contract), TASKS.md (ground truth).

## Org

| Team | Who | Mandate |
|---|---|---|
| CEO / integrator / verifier | Claude (this session, + Explore subagents) | Planning, specs, reviews, live verification, git hygiene, docs of record |
| Core engineering | **kiro** (`kiro-cli`, model opus 4.8, effort per task) | Implementation batches against written specs in `scratch/kiro/*.md` |
| Research | **agy** (`agy` CLI, gemini 3.5 flash, medium/high) | Market research, competitive scans, data-source due diligence |
| Ops | Claude via launchd/Bash | llama-server, scheduler daemon, backups |

**Delegation protocol (hard rules):** every batch gets a spec file
(`scratch/kiro/<task>.md` or `scratch/agy/<task>.md`) with intent, exact files, donor
paths, gates, and "append ## Result; do NOT commit". After every batch: `git diff
--stat` sync, judgment review (line-by-line for business logic), then I commit.
Every claim gets independently verified before its task closes — tests-green alone
is not done (lesson from run 1).

**Routing policy (owner directives, Jul 3 → Jul 4):** **kiro is RETIRED from the
rotation** (owner order, Jul 4 — its final batch G was rescued and completed by the
CEO session). All delegation goes to **agy** (Antigravity: `--model opus` = Claude
Opus 4.6 Thinking when quota allows, `flash` = Gemini 3.5 Flash otherwise; split
large batches — the CLI times out on long single generations; always instruct
"sequential writes, no subagents"). The CEO session absorbs the hard-engineering
lane (integration, state machines, data integrity) plus, as before, architecture,
subtle logic, all verification, and live ops. Concurrent batches only with disjoint
file sets.

**Invocation (both CLIs die without care):** kiro needs a PTY —
`script -q /dev/null kiro-cli chat --no-interactive --trust-all-tools --model
claude-opus-4.8 --effort <e> "<pointer>"` as a BARE background command (compound
prefixes break PTY allocation). agy via
`bash ~/.claude/plugins/agy/scripts/agy-run.sh ask --model <opus|flash> "<pointer>"`.

## Waves (sequenced, each gated)

- **Wave 0 — Ops + governance (Day 1):** task board, llama-server up, EXEC_PLAN,
  CLIs verified. Gate: llama `/health` ok.
- **Wave 1 — Research & architecture (Days 1–3, parallel with Wave 2):**
  market scan (me + agy) → `docs/research/market-scan.md` with adopt/reject
  decisions; `docs/architecture.md` with mermaid diagrams. Gate: both docs merged.
- **Wave 2 — Donor pack (Days 1–4):** kiro batch A (rich prompts + analyzer depth),
  batch B (universe CSV/seed, tripwire rules, synthesize families, capture
  fidelity, TASKS.md honesty fixes). Gate: verify green + my line review + commit.
- **Wave 3 — Live data (Days 4–7):** backfill 10y × full universe against live
  Yahoo/EDGAR (known risk: Yahoo 429 without crumb/cookie handling — fetchers must
  implement crumb dance or fall back to chart API host rotation), stats/news/earnings
  jobs, real overnight chain → real digest. Gate: ≥1.2M price rows, digest with real
  provenance, spot-checks pass.
- **Wave 4 — Live Qwen (Days 7–10):** dossier smoke MU → tune → 2 more sectors.
  Gate: schema-valid verdict, ≤60 min, RecCall written, transcript archived.
- **Wave 5 — UI parity (Days 10–18):** kiro batches per route group; reference
  `docs/reference-micron.html` for story pages. Gate: manual walkthrough evidence
  per route, `next build` green.
- **Wave 6 — Daemon + production hardening (Days 18–22):** scheduler loop, wake
  catch-up live test, install scripts, backups. Gate: sleep/wake test evidence.
- **Wave 7 — Acceptance + docs + final audit (Days 22–28):** Phase-6 end-to-end
  acceptance; user guide + dev guide refreshed to reality; final audit of every
  TASKS.md claim; `WELCOME_BACK.md` for Yash (what shipped, what to check, how to
  run the first real buy-list).

## Standing risks being managed
- **Yahoo 429** (seen in preflight curl): fetchers need browser-like headers +
  crumb/cookie session (yahoo-finance2's approach) — assigned to Wave 3 spec.
- **agy reliability** (went non-functional once in ENGINE history): verify each agy
  run produced output; fall back to my own WebSearch if it stalls.
- **Context longevity:** task board + this file + TASKS.md are the durable state;
  any session can resume from them.

## Status log
- **Jul 3 (~01:00) — llama death #3 + launchd error-5 state.** Server exited
  GRACEFULLY again ("cleaning up before exit" — something is stopping it; cause
  still unknown) and the agent unloaded. Worse: `launchctl bootstrap` now fails
  persistently with error 5 (I/O) even after bootout+enable — a corrupted service
  record. WORKAROUND: llama-server now runs as a detached granted-shell process
  (same pattern as the scheduler). BACKLOG: (a) watchdog direct-spawn fallback when
  bootstrap errors; (b) root-cause the graceful exits (suspect: some system agent
  reaping GUI-domain jobs; revisit with fresh eyes / ask Yash if any cleanup tool
  runs nightly). AUTONOMY TESTS ARMED: digest row for 2026-07-03 cleared → daemon
  must self-generate in the 05:00 window; AVGO requeued → daemon idle-drain runs it
  unattended (already proved pickup-within-one-tick before the llama outage).
- **Jul 3 (night) — daemon TCC incident.** The launchd scheduler agent hung forever
  in `open()` at module load (0.05s CPU, zero output): **macOS TCC blocks launchd
  agents from reading ~/Desktop**, where this repo lives; shell runs work because
  Terminal carries the Files-and-Folders grant (llama's agent is unaffected —
  ~/Models isn't protected). Verified by stack sample (`open$NOCANCEL` under
  StartExecution). WORKAROUND (active): the daemon runs as a detached background
  process from a granted shell → `data/logs/scheduler.log` ticking. PERMANENT FIX
  (needs Yash, GUI): either grant `/opt/homebrew/bin/node` Full Disk Access
  (System Settings → Privacy & Security) and re-`bash deploy/install-launchd.sh`,
  or move the repo out of ~/Desktop. → WELCOME_BACK item.
- **Jul 3 — LIVE DAY.** Backfills complete: **1,343,110 Price rows** (558/563,
  2016→today, 412s), **389,499 EDGAR filings** (554/554, 0 errors, 107s),
  **3,379 FundamentalsQuarter rows** (563/563, 0 errors — Yahoo free depth is only
  ~6-8 quarters/symbol, deepening = backlog). First real overnight chain: 6/6 jobs,
  54s — 962 news items, 126 catalysts, tripwire fired live (SNDK −25% warn), digest
  2026-07-03 persisted. Found+specced: digest starvation (job feeds 3 of 9 SynthInput
  families → kiro batch E). Kiro D landed (18-tool production registry, dossier job,
  0003 migration, 316 tests). agy landed the flagship story UI (reference-faithful,
  web build green) after one CLI timeout (split-scope relaunch worked; lesson in
  scratch/agy/CLAUDE.md). Routing policy updated per owner (agy volume w/ opus-4.6→
  flash fallback; kiro hard lane; CEO hardest+verification). **First live MU dossier
  RUNNING.** 5 delisted Jan-CSV tickers persistently fail backfill — data_health will
  surface; universe refresh = backlog.
- **Jul 2 (am):** Wave 0 done except llama health confirm (service bootstrapped, model
  loading). Task board #1–#10 created. Market scan started (TradingAgents identified
  as closest OSS analogue — 80k★, bull/bear debate, structured outputs, local-model
  support; validates our dossier architecture). Kiro spec A written.
- **Jul 2 (pm):** llama-server UP and inference-verified. ⚡ P0 finding: Qwen thinking
  mode silently eats max_tokens (empty content + reasoning_content) — thinking toggle
  via `chat_template_kwargs.enable_thinking` verified working; provider-hardening
  spec drafted. ⚡ Yahoo naive fetch is hard-throttled (429s incl. query2 after first
  hits) — decision: adopt yahoo-finance2 transport (Wave 3). Market-scan +
  architecture docs written. **Ops lessons:** (1) kiro-cli requires a PTY — invoke via
  `script -q /dev/null kiro-cli chat --no-interactive --trust-all-tools --model
  claude-opus-4.8 --effort <e> "<prompt>"`; plain invocation dies with "channel
  closed". (2) Claude-powered runner subagents can hit the account session limit
  (resets 5pm PT) — drive vendor CLIs from direct background Bash instead; agy/kiro
  spend their own vendor quotas, not Claude's. Batch A relaunched via PTY wrapper.
- **Jul 2 (eve):** Batch A audited (rubric-fidelity greps + judge line-review vs donor)
  and committed — 198 tests. Batch B launched (kiro; universe/tripwires/families/
  capture). **Provider thinking-contract hardening shipped by CEO session** and
  live-verified: starved-budget probe triggered ThinkingBudgetExhausted → auto
  downgrade to no-think → correct JSON same attempt; budgeted thinking recorded
  3,141 reasoningChars. Incident: llama-server found dead AND unloaded from launchd
  despite KeepAlive:true (memory was 92% free — cause unknown); restarted.
  **Backlog(Wave 6): scheduler watchdog — health-probe llama, `launchctl kickstart`
  on failure.** Note: server plist defaults thinking ON — callers must always pass
  the toggle explicitly (completeJson opts). Follow-up filed: thread Living-Memo
  summary into judge/bull/bear user prompts (donor fidelity gap, runner-scoped).
