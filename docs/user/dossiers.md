# Dossiers — the deep dive

A **dossier** is a full research report on one stock, produced by a structured debate.
It's what you run before putting money behind a name.

## What happens inside

When you queue a dossier, the engine runs this pipeline on your local model:

1. **Classify** — pick the right sector lens (semis, SaaS, banks, biotech, energy, REITs,
   consumer, or generic). Deterministic; no model call.
2. **Plan → gather** — a planner chooses which tools to run (fundamentals, QoE forensics,
   technicals, DCF, peers, news…), up to 4 rounds, building an **evidence ledger**.
3. **Bull** argues the strongest case for.
4. **Bear** attacks the bull and makes an independent case against.
5. **Rebuttal** — the bull answers the bear.
6. **Judge** weighs all of it and issues a structured **verdict**: BUY / HOLD / TRIM /
   AVOID, a conviction (HIGH/MEDIUM/LOW), ≥3 falsifiability conditions ("what would change
   my mind"), a target range, and a trade plan with a position size.
7. **Critique** — a risk officer reviews the verdict; if it's overconfident it can trigger
   one revised judgment.
8. **Memo** — a Living Memo update is *staged* for you to apply (never auto-applied).

Expect **~20–45 minutes** per dossier on the local model. That's fine — depth is the point.

## Reading the verdict

- **Recommendation + conviction** — the headline. HIGH conviction means the bull is
  strong *and* the bear was answered.
- **What would change my mind** — the most useful part. These are the monitorable,
  falsifiable conditions. If one trips later, revisit.
- **Trade plan** — entry logic, stop, targets, and a **position size**. Note: the size you
  see is *governed* (see below), not the raw model suggestion.
- **Evidence** — every claim in the verdict cites a tool. Uncited claims were **dropped**
  before you ever saw them.

## The size you see is governed

The judge might suggest 8%. You'll often see **2%**. That's the **calibration governor**
doing its job: until a conviction tier has a real, favorable track record (≥5 resolved
calls, ≥50% favorable), its size is capped at 2%. The dossier shows the reason. This is
the guardrail that lets a local model earn trust over time instead of being trusted
by assumption. See [the buy-list ritual](buy-list-ritual.md).

## Robustness you can rely on

- **It never crashes.** If the model returns something malformed on the final judgment,
  you get a safe HOLD/LOW verdict noting the error — not a lost run.
- **It resumes.** If a run is interrupted, re-running it reuses the stages already done
  (it won't re-argue the bull and bear) and continues from where it stopped.
- **It's bounded.** A wall-clock and call-count budget stops a runaway; you get a partial
  transcript rather than an endless run.

## Where dossiers come from

- **You**, from the digest or a ticker page.
- **Auto-queued** (up to 2/day) when the digest surfaces a critical tripwire or an extreme
  divergence.
- Duplicates within ~14 days are de-duped automatically.
