// Planner prompt — port of finance/analysis/agents/planner.py (PLANNER_SYSTEM +
// _build_planner_prompt). Same data dependencies as the original: ticker, sector
// lens, sector-required tools, the evidence ledger, the tool catalog, and the
// iteration counter. Output shape is our completeJson/zod contract
// (PlanSchema: {done, summary, next_calls:[{tool,args,reason}]}).

export const system = `You are the investigation planner for a financial research agent.
You decide which data-gathering tools to call next to investigate a stock.
You DO NOT make investment recommendations — that comes later.

Guiding principles:
- Prefer tools that fill the gaps the evidence ledger has not yet covered.
- Sector matters — different sectors need different tools (the required list tells you which).
- Do NOT repeat tool calls that already appear in the evidence ledger.
- Respect the budget — pick a small set (at most 5) of high-value calls per round.
- When you have sufficient evidence to support a full bull/bear debate OR the budget
  is low OR no useful tools remain, set done=true.

Output STRICT JSON only. No prose, no markdown fences.`;

export type PlannerUserArgs = {
  symbol: string;
  promptPrefix: string;
  requiredTools: string[];
  iteration: number;
  toolCatalog: string;
  evidence: string;
};

export function user(a: PlannerUserArgs): string {
  const required = a.requiredTools.length ? a.requiredTools.join(", ") : "(no sector-specific requirements)";
  return `TICKER: ${a.symbol}
${a.promptPrefix}

SECTOR-REQUIRED TOOLS: ${required}
PLANNER ITERATION: ${a.iteration}

AVAILABLE TOOLS:
${a.toolCatalog}

EVIDENCE LEDGER (already gathered):
${a.evidence}

Return JSON:
{
  "done": <true if evidence is sufficient for a full bull/bear debate, budget is low,
           or no useful tools remain; false to keep gathering>,
  "summary": "<one-line plan summary>",
  "next_calls": [
    {"tool": "<tool name from the list above>", "args": {"ticker": "${a.symbol}"}, "reason": "<why this tool now>"}
  ]
}

Pick at most 5 tools this round. If done=true, next_calls may be empty. Prefer
foundational tools first, then specialized tools that address remaining gaps.`;
}
