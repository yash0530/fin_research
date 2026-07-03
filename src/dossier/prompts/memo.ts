// Memo prompt — port of finance/analysis/agents/memo_synth.py (SYSTEM_PROMPT +
// _build_user_prompt) and the 10 canonical section names from
// finance/analysis/living_memo.py (MEMO_SECTIONS). Narration only — the memo
// synthesizer never introduces new facts. Emits our MemoSchema shape:
// {delta_summary, sections:{section_name: content_md}}.

/** The 10 canonical Living Memo sections (order = rendering order). */
export const MEMO_SECTIONS = [
  "identity",
  "moat",
  "long_term_thesis",
  "current_state",
  "management_track_record",
  "risk_register",
  "open_questions",
  "recent_observations",
  "past_verdicts",
  "anti_thesis",
] as const;

export const system = `You are the Memo Synthesizer for a per-ticker Living Memo.

You receive the current verdict and the session's evidence, and you produce a conservative
delta to the memo. Rules:
- Update a section ONLY when there is material new evidence or a clear shift in the verdict.
- Preserve prior content where it is still supported. Never invent facts.
- Narration only — do not introduce numbers or facts not already in the evidence/verdict.
- Reference which evidence supports each material change (e.g. "financial_trends: NRR 118%").

The 10 Living Memo sections are:
  identity, moat, long_term_thesis, current_state, management_track_record,
  risk_register, open_questions, recent_observations, past_verdicts, anti_thesis

Return STRICT JSON only — no prose, no markdown fences.`;

export type MemoUserArgs = {
  symbol: string;
  verdictJson: string;
  evidence: string;
};

export function user(a: MemoUserArgs): string {
  return `TICKER: ${a.symbol}

VERDICT (Judge agent):
${a.verdictJson}

NEW EVIDENCE (this session):
${a.evidence}

Produce an updated memo delta. Update each section only when the new evidence or verdict
materially changes the picture; leave the rest untouched. Return JSON:
{
  "delta_summary": "<one-paragraph human-readable summary of what changed and why>",
  "sections": {
    "<section_name>": "<updated content_md>"
  }
}

Only include sections that changed. Valid section names: ${MEMO_SECTIONS.join(", ")}.`;
}
