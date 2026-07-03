# Getting Started

## What ENGINE is

ENGINE is your **research process**, as software. You invest $2,500 of real capital each month; ENGINE is how you decide where it goes. It runs locally on your machine (a local Qwen 3.6 27B model), costs **$0/month** to operate, and produces:

- A **full-market morning digest** — what changed, ranked, with the evidence for each point.
- On-demand **dossiers** — a full bull/bear/judge debate on one stock, ending in a sized recommendation.
- A **screener** and a **discovery queue** for finding names.
- A **monthly buy-list ritual** that turns recent BUY calls into a ranked, sized plan for your $2,500 — and tracks how those calls actually work out.
- A **paste-capture channel** to fold in free web research (Perplexity/Claude/ChatGPT).

> **ENGINE produces research, not advice.** It has **no** connection to any broker and **cannot** place trades — by design, forever. You log the buys you choose to make.

## The one idea to internalize

**The numbers are computed; the words are written on top.** Every insight in the digest, every claim in a dossier, traces back to a real computed value or a dated source. The language model narrates facts that are *already true* — it is never the source of a number. If a claim can't cite evidence, it gets dropped. This is what makes the output trustworthy enough to put money behind.

## Setup & installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the root of the project with the following:
   ```env
   DATABASE_URL="file:./data/engine.db"
   EDGAR_USER_AGENT="Name email"
   ```
   *Note: `DATABASE_URL` defaults to `file:./data/engine.db`, and `EDGAR_USER_AGENT` must be set in the format `Name email` to fetch filings from SEC EDGAR.*

3. **Seed the database:**
   ```bash
   npm run seed
   ```
   This populates 563 tickers and the 23-sector dual-taxonomy. The command is idempotent.

4. **Run backfills:**
   These jobs are resumable and safe to re-run at any time.
   - **SEC EDGAR Index:**
     ```bash
     npm run job -- edgar_index
     ```
     Takes ~2 minutes to download/process ~390k filings.
   - **10-Year Price History:**
     ```bash
     npm run job -- prices10y
     ```
     Takes ~7 minutes to load ~1.34M rows of daily price data.
   - **Fundamentals:**
     ```bash
     npm run job -- fundamentals
     ```
     Takes ~8 minutes. Note that the free Yahoo Finance API provides a depth of approximately 6-8 quarters.
   
   *Honest Limit Warning:* 5 delisted Jan-2026 CSV tickers are known to error during backfills. The `data_health` view/tool surfaces these, which is expected.

5. **Verify the installation:**
   ```bash
   npm run verify
   ```
   This runs the verification suite (typecheck + 316+ tests + CLAUDE.md coverage).

## The Local Model (llama-server)

The deep-dive dossiers and narratives require a local running model:
- **Model:** Qwen 3.6 27B
- **Address:** `localhost:8000` via `llama-server`
- **Daemon:** Managed via launchd plist `com.local.llamacpp`
- **Watchdog:** The scheduler watchdog automatically restarts the model server if it goes down.

## The mental model

Think of ENGINE as three organs around one spine:

1. **The spine** — a deterministic synthesis engine that reads your local data and ranks what matters, with provenance on every line.
2. **The debate brain** — when you want depth, it runs a multi-agent debate (a bull, a bear, a rebuttal, a judge, a risk-officer critique) and produces a sized verdict.
3. **The discipline** — a *calibration governor* that refuses to let any recommendation be sized up until its track record has earned it. Early on, everything is capped conservatively. That is intended.

## Where to go next

- [The daily workflow](daily-workflow.md) — your morning, in five minutes.
- [Dossiers](dossiers.md) — when you want to go deep on a name.
- [The buy-list ritual](buy-list-ritual.md) — the 1st-of-month routine.
- [The capture channel](capture.md) — pulling in outside research for free.
- [FAQ](faq.md) — safety, cost, troubleshooting.
