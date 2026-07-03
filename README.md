# fin_research — ENGINE

A personal, local-first investing research engine that unifies three prior projects: Edge Terminal, Signal Desk, and ENGINE. Built to support deploying $2,500/month of real capital, it provides a full-market morning digest, on-demand multi-agent dossiers, and automated discovery. Operating costs are ≈$0/month by utilizing a local Qwen 3.6 27B model and free APIs.

> [!IMPORTANT]
> **Honest Limit & Prohibition:** ENGINE produces research, not investment advice. There is no broker integration, no order placement, and no trade execution code anywhere in this repository, ever. All trades must be executed manually.

## Requirements
- **OS:** macOS
- **Runtime:** Node.js 22+
- **Local Model:** `llama-server` running Qwen 3.6 27B at `http://localhost:8000` (see donor reference: [LOCAL_QWEN_SETUP.md](file:///Users/yash/Desktop/Programming/ResearchEngine/LOCAL_QWEN_SETUP.md))
- **Environment:** `EDGAR_USER_AGENT` environment variable set (format: `Name email`) to query SEC EDGAR.

## LIVE Status
- **Data Universe:** 563-ticker dual-taxonomy universe (GICS base + AI-infra lens).
- **Core Datasets:** 1.34M-row 10-year daily price history, 389k SEC EDGAR filings (Form 4, 8-K, 10-Q, 10-K, DEF 14A), and quarterly fundamentals (Yahoo Finance, ~6-8 quarters depth).
- **Overnight Chain:** Automated nightly job: prices → stats → news → earnings → tripwires → digest (synthesizing a 16-insight morning digest).
- **Multi-Agent Dossier Engine:** On-demand deep-dive debate on local Qwen running stages: planner → tools → bull → bear → rebuttal → judge → critique → memo → story. Features citation enforcement ("no naked numbers" on computed facts) and a calibration governor that caps recommendation sizing at 2% until a favorable track record is earned.
- **Story Pages:** Flagship editorial layouts generated from frozen data snapshots, including a client scenario estimator.
- **Web UI:** Interactive Next.js routes for the morning read, digests, dossiers, tickers, calibration, buylist, and stories.

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
   npm run job -- prices10y
   npm run job -- fundamentals
   ```
4. **Run the overnight pipeline:**
   ```bash
   npm run job -- overnight
   ```
5. **Run a deep-dive dossier debate:**
   ```bash
   npm run job -- dossier --symbols=MU
   ```
6. **Start the Web UI:**
   ```bash
   cd web && npm run dev
   ```

To run all checks and verify the codebase is green (runs 348 tests, TypeScript checks, and CLAUDE.md checks):
```bash
npm run verify
```

## Project Documentation
- **Architecture & System Flows:** [docs/architecture.md](file:///Users/yash/Desktop/Programming/fin_research/docs/architecture.md) (system context diagram, pipeline stages)
- **User Guides:** [docs/user/](file:///Users/yash/Desktop/Programming/fin_research/docs/user/) (daily workflow, buylist ritual, capture guides)
- **Research & Strategy Decisions:** [docs/research/market-scan.md](file:///Users/yash/Desktop/Programming/fin_research/docs/research/market-scan.md)
- **Build Ledger & Known Limits:** [TASKS.md](file:///Users/yash/Desktop/Programming/fin_research/TASKS.md) (comprehensive feature checklist, Yahoo free-tier limits, stale tickers)
- **Operations Log:** [EXEC_PLAN.md](file:///Users/yash/Desktop/Programming/fin_research/EXEC_PLAN.md)
