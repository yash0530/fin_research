# Dossiers — the deep dive

A **dossier** is a deep-dive research report on a single stock, generated via a structured multi-agent debate. Run a dossier to obtain a conviction-ranked trade plan and position sizing before committing real capital.

## How to Queue and Run a Dossier

To run a dossier manually from the CLI:
```bash
npm run job -- dossier --symbols=MU
```

Dossier runs can also be triggered:
- **From the Web UI**: Manually queued from the morning digest or individual ticker cockpit pages.
- **Auto-queued**: Up to 2/day when the overnight digest detects a critical tripwire or extreme sector divergence.
*Note:* Duplicated dossier requests for the same symbol within a 14-day window are automatically de-duplicated and skipped.

## The Dossier Pipeline

When a dossier runs, the engine executes these stages sequentially on your local Qwen model. It prints stage progress to the console. Expect **~20–45 minutes** per run.

1. **Classify** — Selects the appropriate sector lens (semis, SaaS, banks, biotech, energy, REITs, consumer, or generic). This step is entirely deterministic; no model call is made.
2. **Plan & Gather** — A planner agent chooses which quantitative and qualitative tools to execute (such as fundamentals, QoE forensics, technicals, DCF, peers, and news). It iterates for up to 4 rounds to compile a structured **evidence ledger**.
3. **Bull** — Argues the strongest possible case for the stock using the evidence ledger.
4. **Bear** — Attacks the bull's arguments and presents an independent case against.
5. **Rebuttal** — The bull agent responds to the bear's points.
6. **Judge** — Weighs the debate transcript and issues a structured **verdict**: BUY, HOLD, TRIM, or AVOID, alongside a conviction tier (HIGH, MEDIUM, LOW), a target range, a trade plan, and ≥3 falsifiability conditions ("what would change my mind").
7. **Critique** — A risk officer agent critiques the judgment; if it identifies overconfidence, it triggers a single revised judgment.
8. **Memo Stage** — Generates and stages a **Living Memo** delta consisting of 10 structured sections. Rather than using raw RAG, this implements a "distillation-over-RAG" philosophy where the living memo serves as the central, compounding per-ticker knowledge store. Staged deltas are human-gated: you can review, and either **Apply** or **Reject** them in the Web UI (on the `/memos` page or individual ticker cockpits). Applied memos carry forward as context into all future dossiers for that symbol, allowing the engine's understanding of the business to compound over time.

## Robustness & Error Recovery

- **Resumable**: If a dossier run is interrupted (e.g., laptop sleep, server restart), re-running the command resumes from the last completed stage. It will not re-run stages (like the Bull/Bear debates) that are already saved.
- **Safe Fallbacks**: If the local model returns malformed JSON on the final judgment, the engine does not crash. It automatically falls back to a safe `HOLD` recommendation with `LOW` conviction, accompanied by an error note detailing what happened.
- **Bounded Budgets**: A strict wall-clock and LLM call-count budget stops runaway loops. If a budget is exceeded, the run terminates safely and outputs a partial transcript rather than hanging indefinitely.

## Understanding the Verdict & Sizing

Every claim inside a final verdict must cite a tool from the evidence ledger. Any uncited claims or "naked numbers" proposed by the model are automatically dropped before the user sees the output.

### The Calibration Governor

Although the dossier's Judge may propose a large position size (e.g., 8%), the actual size you see on the dashboard is governed:
- **2% Conservative Cap**: Until a conviction tier establishes a verified track record, all recommendations in that tier are capped at **2%** of capital.
- **Lifting the Cap**: A tier's cap is lifted only after it achieves **≥5 resolved calls** with a **≥50% favorable** resolution rate.
This governor is a core safety mechanism designed to ensure the local model earns your trust over time through real outcomes. It is deliberate and cannot be overridden. See [The Monthly Buy-List Ritual](buy-list-ritual.md) for details.
