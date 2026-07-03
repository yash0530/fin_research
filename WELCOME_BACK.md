# WELCOME BACK 👋

*(Living document — updated throughout the vacation month. Started Jul 3, 2026.)*

## The one-paragraph version

The platform is **live and running itself**: every morning the daemon generates the
full-market digest unattended (proven Jul 3, 05:00 window — 16 insights + daily
backup, zero human involvement); dossiers queue and drain autonomously (AVGO ran
itself overnight; TSM as well); every deep dive ends in a governed RecCall and an
editorial story page. Suite: 356 tests. Your calibration ledger has begun.

## What to do in your first 30 minutes

1. `cd fin_research && npm run verify` — see it green.
2. `cd web && npm run dev` → open `/` — your morning read is waiting.
   Then `/dossiers`, `/story`, `/tickers/NVDA`, `/calibration`.
3. Read `TASKS.md` (the honest ledger) and `EXEC_PLAN.md`'s status log (the ops
   diary — every incident, root cause, and workaround).

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
