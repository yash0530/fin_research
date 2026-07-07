# WELCOME BACK 👋

*(Living document — updated throughout the vacation month. Started Jul 3, 2026.)*

## The one-paragraph version

The platform is **live and running itself**: every morning the daemon generates the
full-market digest unattended (proven Jul 3, 05:00 window — 16 insights + daily
backup, zero human involvement); dossiers queue and drain autonomously (AVGO ran
itself overnight; TSM as well); every deep dive ends in a governed RecCall and an
editorial story page. Suite: 356 tests. Your calibration ledger has begun.

## What to do in your first 30 minutes

1. `npm run verify` — see it green.
2. `cd web && npm run dev` → open `/` — your morning read is waiting.
   Then `/dossiers`, `/story`, `/tickers/NVDA`, `/calibration`.
3. Read `TASKS.md` (the honest ledger) and `EXEC_PLAN.md`'s status log (the ops
   diary — every incident, root cause, and workaround).


## Month 2 additions

We have successfully integrated the following Month 2 features:
- **EDGAR XBRL Fundamentals Backfill:** `npm run job -- edgar_facts` (runs after `edgar_index` using `Ticker.cik`) backfills years of quarterly fundamentals from `data.sec.gov companyfacts`. This deepens the local database (`FundamentalsQuarter` grew 3.4k → 35k rows, providing ~64–82 quarters per symbol back to 2006–2008). It is free, follows an 8 req/s etiquette, and uses `INSERT OR IGNORE` to never overwrite Yahoo Finance quarters.
- **Living Memos (`/memos`, `/memos/[symbol]`):** Every dossier stages a memo delta across 10 structured sections. You review and Apply or Reject staged deltas in the UI (human-gated). Applied memos carry forward into future dossiers, forming a compounding "distillation-over-RAG" knowledge store.
- **Calibration Campaign:** `npm run job -- campaign` (and daemon idle-drain) keeps the dossier queue stocked (watchlist → AI lens → GICS leaders, backlog-capped) to grow the `RecCall` ledger. Every `RecCall` carries a `promptVersion` tag so changes never contaminate calibration slices.
- **Outcomes Loop:** `npm run job -- outcomes` runs in the overnight chain, evaluating 1m/3m/6m/1y horizons from local closes. View progress on the `/calibration` page.
- **New Web Pages:** Added `/signals` (RuleEvent history), `/journal` (Journal entries), `/discovery` (candidate queue), and `/memos` (living memos). The `/screener` now runs on the real `@engine` screener.
- **Capture Write Path (`/capture`):** The interactive web research paste flow (render → copy → paste → parse → commit) now natively supports committing structured `EvidenceItem`, `DiscoveryCandidate`, or `Catalyst` records.

## Decisions only YOU can make

1. **macOS TCC grant (unblocks true launchd autonomy).** launchd agents cannot read
   ~/Desktop (the daemon hung forever in `open()`; stack-sampled). Current
   workaround: daemon + llama-server run as detached shell processes — they survive
   sessions but NOT a reboot. Fix: System Settings → Privacy & Security → Full Disk
   Access → add `/opt/homebrew/bin/node` (and `llama-server`), then
   `bash deploy/install-launchd.sh`. Alternative: move the repo out of ~/Desktop.
2. **Sizing philosophy for the ritual.** The governor caps unproven tiers at 2%.
   2% of a $2,500 monthly tranche = $50 < the $100 minimum lot → until calibration
   is earned, drafted months are honestly ALL CASH. Options: (a) accept it (cash
   accumulates; trust arrives ~5 resolved calls/tier), (b) interpret sizes as % of
   TOTAL portfolio rather than the monthly tranche, (c) raise the unproven cap.
   The code does (a) today; nothing deploys without you regardless.
3. **llama-server graceful exits (3× during the month).** Something stops it cleanly
   ("cleaning up before exit") and once corrupted its launchd record (bootstrap
   error 5). Suspect a system cleanup agent. It self-heals via the scheduler
   watchdog + direct-spawn, but worth knowing what on your Mac kills GUI-domain
   jobs.

## The first real calls in your ledger

| Symbol | Verdict | Governed | The one-liner |
|---|---|---|---|
| MU | AVOID / LOW | 0% | Risk officer overturned an initial BUY: "forward-earnings value trap until stabilization" — with re-entry triggers |
| NVDA | HOLD / MEDIUM | 2% | Semis-framed debate; judge wanted 3%, governor capped |
| AVGO | HOLD / MEDIUM | 2% | Ran entirely unattended overnight |
| TSM | AVOID / LOW | 0% | Fully autonomous under the daemon: semis-routed, story page born with it |

**Research-culture observation:** 4 verdicts, 0 BUYs (2 AVOID, 2 HOLD) in a hot
sector — the judge+critique pair leans conservative. That may be discipline or
over-caution; the outcome horizons now filling automatically will tell you which.
That question is exactly what the calibration ledger exists to answer.

Outcome horizons (1m/3m/6m/1y) fill automatically; `/calibration` shows the
governor's earned-trust progress per tier.

## Daily rhythm (what the machine does without you)

05:00-window: overnight chain (prices→stats→news→earnings→tripwires→digest) +
backup. Idle ticks: drain any queued dossiers (one at a time, llama-locked) +
llama watchdog. You: read `/`, queue dossiers (`npm run job -- dossier
--symbols=X`), paste web research at `/capture`, and on the 1st run
`npm run job -- buylist_draft` → review at `/buylist`.

## Where everything is

`README.md` (front door) · `docs/architecture.md` (diagrams) · `docs/user/*`
(guides) · `docs/research/market-scan.md` (the landscape study) · `TASKS.md`
(build ledger + evidence) · `EXEC_PLAN.md` (ops log + delegation policy history:
kiro built the engine's hard layers until you retired it Jul 4; agy carried the
UI/docs volume on opus 4.6 → flash 3.5) · `NEXT_RUN.md`/`ROADMAP.md` (historical
plans).

*(Sections below appended as the month progresses.)*

---

# Month 3 — "Prove it and sharpen it"

Theme: the platform was built (M1) and deep (M2); month 3 asked whether the research is
any GOOD and can we show it. Operating model: CEO thinks/specs/audits, **agy wrote all
source** (~15 batches, flash 3.5). Four themes, four honest results.

## A — Data integrity (the gate)
Found the 20y price series used RAW close → unadjusted splits/recaps corrupted 15
symbols (e.g. KDP 123→22 was a 2018 special-dividend recap). Fixed: ingest **adjusted
close** (`yahoo2` now prefers `adjclose`), forced re-backfill. Verified: KDP smooth,
real crashes (APA oil-war) correctly preserved. New job: `npm run job -- integrity_check`.

## B — Backtest (the flagship) — READ docs/research/backtest-findings.md
Replayed the deterministic signals over 107 monthly as-of points, 2010-2025 (leak-free,
verified). **HONEST VERDICT: the raw signals do NOT have robust standalone edge.** The
+10% "excess" at 1y is volatility premium + survivorship bias (hit-rates ~50%; three
contradictory signal families all converge on the same number). Weak-but-real:
short-term reversal + a drawdown mean-reversion tilt. **Consequence: read the digest's
movers/drawdown as "look here", NEVER "buy this". Don't trade signals mechanically** —
which validates the research-first design. Re-run: `npm run job -- backtest`.

## C — Canonical earnings forensics — READ docs/research/qoe-canonical-findings.md
The QoE tool was silently degrading to an FCF proxy on every dossier. Now: stores 8
canonical inputs (20y), computes real **Altman Z that tracks reality** (AAPL grey-zone
vs MU/NVDA safe — a naive impl would miss that), canonical accrual (sanity-guarded).
Honest limits documented: accrual can be inflated where quarterly CFO is sparse;
Beneish/Piotroski honestly omitted (need clean annual periods — the documented next
step). The 20y deep fundamentals also feed DCF, trends, and story charts.

## D — Portfolio / thesis monitoring (closes research→own→monitor)
NEW **`/portfolio`** page: enter your real positions (qty, avg cost) → P&L + mechanical
**thesis-decay signals**: stop_breach (price below the dossier's stop), drawdown (≥25%
off high), target_reached, below_cost. The dossier's free-text `what_would_change_mind`
is shown as a MANUAL checklist (can't be auto-evaluated — honest). Job:
`npm run job -- portfolio_check`. NOTE: demo positions were cleared — the portfolio is
empty and yours to fill.

## Month-3 owner notes / small tech debt
- **Read the digest as a lens, not a signal to trade** (the backtest is why).
- QoE forensics: Altman is solid; treat the accrual as directional, not precise.
- `edgar_facts` re-runs skip on BackfillProgress — to re-fetch after a parser change you
  must `DELETE FROM BackfillProgress WHERE task='edgar_facts'` first (should get a
  `--force` flag like prices10y; minor backlog).
- New jobs this month: `integrity_check`, `backtest`, `portfolio_check` (+ existing
  `campaign`, `outcomes`, `universe_check` from earlier). New docs: `MONTH3_PLAN.md`,
  `docs/research/backtest-findings.md`, `docs/research/qoe-canonical-findings.md`.
- Suite: **425 tests**, verify + web build green, 61 CLAUDE.md dirs.

---

# Switched to ON-DEMAND (no more automation)

**What changed (owner directive):** the platform no longer runs itself. The always-on
scheduler daemon and the always-resident model are **gone**. Nothing runs, and nothing
holds RAM, until you click a button.

- **How you run things now:**
  - Web UI → `/dossiers` **Run deep-dive** (type 1+ tickers), `/` **Refresh digest** and
    **Refresh data**. Or CLI: `npm run job -- <name> --manage-llama`.
  - Every model-bearing run **boots `llama-server` into memory, does the work, then kills
    it to free the RAM**. Boot is ~1–2 min cold (fast if the model is still page-cached).
    Data-only jobs (`refresh_data`) never boot the model.
- **The mechanism:** `scripts/job.ts --manage-llama` wraps the run in a single-run lock
  (`src/jobs/run-lock.ts`, a `data/run.lock` pidfile) + `withLlamaServer`
  (`src/analyst/llama-lifecycle.ts`, boot→wait-for-`/health`→run→SIGTERM/SIGKILL). The web
  buttons spawn that exact process detached (`web/lib/run-trigger.ts`) and poll for status.
  A second run while one is in flight is refused (`[BUSY]`); a crashed run's orphaned model
  is reaped on the next run.
- **Automation removed:** both launchd agents (`com.engine.scheduler`, `com.local.llamacpp`)
  were booted out; `scripts/scheduler.ts` is deprecated/not-installed; the dossier
  **campaign no longer auto-seeds** (still available as a manual `campaign` job). The
  model's launch command now lives, version-controlled, in `src/config/llama.ts`.
  Migrating a machine off the old setup: `bash deploy/uninstall-launchd.sh`.
- **`start.sh`/`stop.sh`** updated: `start.sh` launches only the Web UI (no daemon);
  `stop.sh` also kills any resident `llama-server` to free RAM.
- Suite: **438 tests** (+13: llama-lifecycle, run-lock), verify + web build green.

**One thing to know:** the calibration ledger will now grow only as fast as you click.
The campaign used to grind ~1 dossier/hour unattended; that's off. Queue deep-dives
deliberately on names you care about.
