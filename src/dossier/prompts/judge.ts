// Judge prompt — port of finance/analysis/agents/judge.py (JUDGE_SYSTEM +
// _build_judge_prompt). The conviction rubric and the verdict field guidance are
// ported verbatim from the donor (its crown jewel), adapted to emit our flat
// VerdictSchema shape. Weighs bull + bear + rebuttal + evidence, sets conviction
// honestly, and defines falsifiable "what_would_change_mind" conditions.

export const system = `You are an investment analyst about to allocate real capital for an individual investor.
Operate with disciplined sizing, entry, exit, and risk controls; those matter as much as narrative quality.

You receive a bull case, a bear case, a bull rebuttal defending the thesis, and the raw evidence. Your job:
1. Weigh all inputs and produce a recommendation.
2. Set conviction honestly — only HIGH when the bull thesis is strong AND the bear concerns are well-addressed.
3. Define WHAT WOULD CHANGE YOUR MIND (what_would_change_mind) — falsifiable, monitorable conditions.
4. Produce a trade plan: stop methodology, targets, and position size guidance.
5. Explicitly weigh technical indicators (RSI overbought/oversold, MACD, golden/death
   cross, moving averages, chart patterns from [technicals]) and relative-rank scanner
   signals (sector momentum, forward multiples vs sector/market, leader/laggard tags from
   [relative_rank]) to synthesize optimal entry/exit levels and capital fit.

Conviction calibration:
- HIGH: multiple independent supports; bear case addressed with evidence; falsifiability conditions clear and distant
- MEDIUM: thesis reasonable but at least one bear argument partially unresolved, OR key evidence missing
- LOW: significant unresolved questions; flag for further research, not capital deployment

Output STRICT JSON only.`;

export type JudgeUserArgs = {
  symbol: string;
  promptPrefix: string;
  currentPrice: number;
  /** Living-Memo summary — donor judge weighs the prior thesis (LIVING MEMO CONTEXT). */
  memoSummary?: string;
  evidence: string;
  bullMd: string;
  bearAttackMd: string;
  independentBearMd: string;
  rebuttalMd: string;
  revisionNote?: string;
};

export function user(a: JudgeUserArgs): string {
  const rev = a.revisionNote ? `\n\nRISK-OFFICER REVISION REQUEST:\n${a.revisionNote}` : "";
  return `TICKER: ${a.symbol}
CURRENT PRICE: ${a.currentPrice}

${a.promptPrefix}

LIVING MEMO CONTEXT:
${a.memoSummary || "(no prior memo)"}

EVIDENCE LEDGER:
${a.evidence}

BULL CASE:
${a.bullMd || "(none)"}

BEAR ATTACK ON BULL:
${a.bearAttackMd || "(none)"}

INDEPENDENT BEAR CASE:
${a.independentBearMd || "(none)"}

BULL REBUTTAL TO BEAR:
${a.rebuttalMd || "(none)"}${rev}

Return JSON:
{
  "summary": "<one-sentence verdict>",
  "recommendation": "BUY | HOLD | TRIM | AVOID",
  "conviction": "HIGH | MEDIUM | LOW",
  "bull_case": [
    {"claim": "<headline bull point>", "evidence_refs": ["<tool>"], "confidence": "high|medium|low"}
  ],
  "bear_case": [
    {"claim": "<headline bear point>", "evidence_refs": ["<tool>"], "confidence": "high|medium|low"}
  ],
  "what_would_change_mind": [
    "<specific, monitorable falsifiability condition #1>",
    "<#2>",
    "<#3>"
  ],
  "target_price_range": {"low": <number>, "high": <number>, "timeframe": "<e.g. 12 months>"},
  "trade_plan": {
    "position_size_pct": <0-15 — % of deployable capital>,
    "stop_price": <number or null>,
    "rationale": "<stop methodology (volatility|structure|thesis) + 1-2 sentence size justification>"
  }
}

Hard requirements:
- bull_case and bear_case must each have 2-4 items, each citing evidence.
- what_would_change_mind must have at least 3 specific conditions, each monitorable (a number, a date, or an event).
- trade_plan.position_size_pct must be between 0 and 15.
- If recommendation is AVOID, position_size_pct = 0.`;
}
