# ROADMAP — from verified skeleton to compounding research system

Owner: Yash. This file is the standing program plan; NEXT_RUN.md is the current
build contract. Update both at phase boundaries.

## Constitution (non-negotiable)
1. **No rewrite #5.** fin_research is the final home. All change is additive.
2. **Nothing ships on tests-green alone.** Every agent run ends with an independent
   verification pass; live evidence (real data, real Qwen calls, rendered UI) is the bar.
3. **Research, not advice.** No broker/order/execution code, ever.
4. **Deterministic first.** The LLM narrates computed facts; provenance on every insight.
5. **$0 ops by default.** Paid data/API spend requires one month of documented evidence
   that the free stack was the binding constraint (see Spending triggers).
6. **Every buy goes through the ritual and is logged.** Side-door trades corrupt calibration.

## Phases

### A — Ship the platform (Jul 2–13, 2026)
- Day 0: start llama-server; freeze donor repos (commit ResearchEngine's uncommitted
  qwen work, then treat finance/ResearchApp/ResearchEngine as read-only donors);
  launch Run 2 **locally** against NEXT_RUN.md.
- Run 2 (≈ Jul 2–4): Phases 0–3 of NEXT_RUN.md — donor pack (rich prompts, analyzers,
  tripwires, universe CSV), real 10y backfill, first live Qwen dossier, real digest.
- Verification Gate: independent audit of run 2 (claims vs evidence), fix-list.
- Run 3 (≈ Jul 5–9): Phases 4–5 — UI to daily-driver parity (digest home, dossier
  detail, story pages with charts, capture, buy-list, calibration), daemon + wake.
- **Gate C (by Jul 13): Phase 6 acceptance passes end-to-end, live.**

### B — Burn-in & calibration bootstrap (Jul 14–31)
- Use it every morning (goal: ≥90% of trading days).
- 15–25 dossiers across GICS + AI-infra names; tune prompts from transcripts.
- 2+ paste-capture sessions/week (Perplexity/Claude web research → evidence).
- Mid-July: full buy-list DRY RUN (paper) to shake out the ritual.
- Health targets to exit B: JSON-failure rate <5% per dossier, median dossier ≤45 min,
  digest ready by 8am ≥90%, zero data-integrity incidents unexplained.

### C — First real deployment (Aug 1)
- Run the ritual on real capital: $2,500 allocated per the governed draft
  (expect ~2% caps everywhere — correct: conviction is unproven), residual to cash,
  every fill logged. These calls start the track record.
- Repeat monthly. The governor needs ≥5 resolved calls per tier at ≥50% favorable —
  earned sizing arrives ~Q4 2026. Do not override it.

### D — Operate & compound (Aug →)
- **Daily (10 min):** read digest; queue 0–2 dossiers; ack signals.
- **Weekly (45 min):** screener sweep, capture session, review finished dossiers +
  staged memo deltas, check /ops job health.
- **Monthly (1st, 60–90 min):** outcomes review → re-rate stages → buy-list draft →
  finalize → deploy → journal.
- **Quarterly:** calibration deep-read, universe check, prompt/eval refresh,
  spending-trigger review, ROADMAP update.

## Risk register
- **Qwen judge quality** → run-2 prompt port; personal eval set (5 tickers Yash knows
  cold — grade the verdicts); if still weak, route ONLY the judge role to a cloud
  profile via config/settings.ts override (one line), keep everything else local.
- **Yahoo instability at 500+ tickers** → self-healing jobs, throttle knob,
  SymbolOverride; escalate to paid data only via spending trigger.
- **Attention drift** → if the digest goes unread 5 straight days, cut scope until it
  earns the morning slot again; never add features to fix disuse.
- **Single-machine fragility** → launchd keepalive, daily VACUUM backups (keep 14),
  pre-migration snapshots.

## Monthly scorecard (put in the digest on the 1st)
Platform: digest-on-time %, dossier success %, median dossier minutes, backfill
freshness. Research: favorable rate by conviction tier, falsifiability conditions that
actually fired. Usage: mornings read, dossiers run, captures committed. Capital:
$ deployed vs plan, positions vs governed sizes.

## Spending triggers (the only paths off $0/month)
- Transcripts repeatedly named as the missing evidence in dossiers → FMP starter tier.
- Options flow becomes a real edge in practice → Unusual Whales.
- Judge quality measurably capped by local model → small metered API budget for the
  judge role only.
Each requires a month of documented evidence + a line in this file when adopted.
