# fin_research — ENGINE

A personal, local-first investing research engine that unifies three prior projects: Edge Terminal, Signal Desk, and ENGINE. Built to support deploying $2,500/month of real capital, it provides a full-market morning digest, on-demand multi-agent dossiers, and automated discovery. Operating costs are ≈$0/month by utilizing a local Qwen 3.6 27B model and free APIs.

> [!IMPORTANT]
> **Honest Limit & Prohibition:** ENGINE produces research, not investment advice. There is no broker integration, no order placement, and no trade execution code anywhere in this repository, ever. All trades must be executed manually.

## Operating model — on-demand, not always-on
ENGINE runs **only when you ask it to**. There is no background daemon and the local model
is **not kept resident**. Each run — a deep-dive, a digest refresh — boots `llama-server`
into memory, does the work, then **kills it to free the RAM**. Trigger runs from the web UI
(**Run deep-dive** on `/dossiers`; **Refresh digest** / **Refresh data** on `/`) or the CLI
(`npm run job -- <name> --manage-llama`). Migrating off an older always-on install? Run
`bash deploy/uninstall-launchd.sh` once.

## Requirements
- **OS:** macOS
- **Runtime:** Node.js 22+
- **Local Model:** `llama-server` + the Qwen 3.6 27B GGUF installed (launch command in
  `src/config/llama.ts`; **booted on-demand per run**, not kept running). Setup donor
  reference: [LOCAL_QWEN_SETUP.md](file:///Users/yash/Desktop/Programming/ResearchEngine/LOCAL_QWEN_SETUP.md)
- **Environment:** `EDGAR_USER_AGENT` environment variable set (format: `Name email`) to query SEC EDGAR.

## LIVE Status
- **Data Universe:** 563-ticker dual-taxonomy universe (GICS base + AI-infra lens).
- **Core Datasets:** 1.34M-row 10-year daily price history, 389k SEC EDGAR filings, Yahoo Finance quarterly fundamentals (~6–8 quarters depth), and SEC EDGAR XBRL companyfacts quarterly fundamentals (~64–82 quarters/symbol back to 2006–2008, expanding database to 35k rows).
- **Digest Chain (on-demand):** `Refresh digest` runs prices → stats → news → earnings → tripwires → digest (a ~16-insight morning read) + outcomes; `Refresh data` runs the same minus the model. Both boot the model only if narration is needed and free it after.
- **Multi-Agent Dossier Engine & Memos:** On-demand deep-dive debate on local Qwen running stages: planner → tools → bull → bear → rebuttal → judge → critique → memo → story. Generates human-gated Living Memos (10 sections) that compound knowledge across runs. Features citation enforcement ("no naked numbers").
- **Calibration:** The `campaign` job can seed the dossier queue (watchlist → AI lens → GICS leaders) for a deliberate manual batch. Evaluates 1m/3m/6m/1y outcomes from local closes under a calibration governor that caps sizing at 2% until a favorable track record is earned. (No longer auto-seeded on a timer.)
- **Story Pages:** Flagship editorial layouts generated from frozen data snapshots, including a client scenario estimator.
- **Web UI:** Interactive Next.js routes for morning read (`/`), digest history (`/digest/[date]`), ticker cockpits (`/tickers/[symbol]`), dossiers (`/dossiers/[id]`), signals (`/signals`), journal (`/journal`), discovery (`/discovery`), memos (`/memos`), calibration (`/calibration`), buylist (`/buylist`), and stories (`/story`).

## Quickstart
1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Seed the database** (idempotent, populates tickers/sectors):
   ```bash
   npm run seed
   ```
3. **Run data backfills** (resumable jobs; 5 stale Jan-2026 tickers are known to record error rows):
   ```bash
   npm run job -- edgar_index
   npm run job -- edgar_facts
   npm run job -- prices10y
   npm run job -- fundamentals
   ```
4. **Refresh the digest** (`--manage-llama` boots the model for narration, then frees it):
   ```bash
   npm run job -- overnight --manage-llama    # or: refresh_data (no model)
   ```
5. **Run a deep-dive dossier debate** (`--manage-llama` = boot model → run → kill it):
   ```bash
   npm run job -- dossier --symbols=MU --manage-llama
   ```
6. **Start the Web UI** (the on-demand buttons live here — no daemon):
   ```bash
   cd web && npm run dev
   ```
   Then click **Run deep-dive** (`/dossiers`) or **Refresh digest / data** (`/`). Each click
   boots `llama-server` for that run and kills it after. (Data-only jobs never boot it.)

To run all checks and verify the codebase is green (runs the full suite, TypeScript checks, and CLAUDE.md checks):
```bash
npm run verify
```

To additionally smoke-test the web UI's 5 live routes in a real Chromium browser (builds
the Next.js app, then runs Playwright against a temp fixture SQLite DB — never
`data/engine.db`; requires `npx playwright install chromium` once). Kept separate from
`npm run verify` so that gate never grows a browser dependency:
```bash
npm run verify:ui
```

## Project Documentation
- **Architecture & System Flows:** [docs/architecture.md](file:///Users/yash/Desktop/Programming/fin_research/docs/architecture.md) (system context diagram, pipeline stages)
- **User Guides:** [docs/user/](file:///Users/yash/Desktop/Programming/fin_research/docs/user/) (daily workflow, buylist ritual, capture guides)
- **Research & Strategy Decisions:** [docs/research/market-scan.md](file:///Users/yash/Desktop/Programming/fin_research/docs/research/market-scan.md)
- **Build Ledger & Known Limits:** [TASKS.md](file:///Users/yash/Desktop/Programming/fin_research/TASKS.md) (comprehensive feature checklist, Yahoo free-tier limits, stale tickers)
- **Operations Log:** [EXEC_PLAN.md](file:///Users/yash/Desktop/Programming/fin_research/EXEC_PLAN.md)
