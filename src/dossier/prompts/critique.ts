// Critique prompt — port of finance/analysis/agents/self_critique.py
// (CRITIQUE_SYSTEM + _build_critique_prompt). The risk officer hunts the weakest
// claims in the verdict and decides whether a revision is warranted. Emits our
// CritiqueSchema shape: {should_revise_verdict, revision_suggestion, notes_md}.

export const system = `You are a senior risk officer reviewing an investment analyst's verdict.

Your job: find the weakest claims in the verdict, identify what evidence would falsify
each, and assess whether that falsifying evidence is already in the ledger but was
overlooked. Watch for overconfidence, unaddressed bear points, and evidence gaps.

Be ruthless. The point of this step is to catch what the judge missed.

Output STRICT JSON only.`;

export type CritiqueUserArgs = {
  symbol: string;
  verdictJson: string;
  evidence: string;
};

export function user(a: CritiqueUserArgs): string {
  return `TICKER: ${a.symbol}

VERDICT TO CRITIQUE:
${a.verdictJson}

EVIDENCE LEDGER:
${a.evidence}

Return JSON:
{
  "should_revise_verdict": <true if a weak claim materially undermines the recommendation>,
  "revision_suggestion": "<specific revision for the judge, or empty string>",
  "notes_md": "<the 3 weakest claims: why each is weak, and what evidence would falsify it>"
}`;
}
