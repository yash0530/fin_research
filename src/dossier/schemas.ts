import { z } from "zod";

// Flat, forgiving zod schemas for each agent — flat because an unbenchmarked
// local model formats simple shapes far more reliably than deeply nested ones.
// The judge verdict mirrors finance/analysis/agents/judge.py's contract.

export const ConfidenceEnum = z.enum(["high", "medium", "low"]);

export const PlanSchema = z.object({
  done: z.boolean(),
  summary: z.string().default(""),
  next_calls: z
    .array(
      z.object({
        tool: z.string(),
        args: z.record(z.unknown()).default({}),
        reason: z.string().default(""),
      }),
    )
    .default([]),
});
export type Plan = z.infer<typeof PlanSchema>;

export const ClaimSchema = z.object({
  claim: z.string(),
  evidence_refs: z.array(z.string()).default([]),
  confidence: ConfidenceEnum.default("medium"),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const BullSchema = z.object({
  thesis_md: z.string(),
  points: z.array(ClaimSchema).default([]),
});
export type BullThesis = z.infer<typeof BullSchema>;

export const BearSchema = z.object({
  independent_bear_md: z.string(),
  attack_md: z.string().default(""),
  points: z.array(ClaimSchema).default([]),
});
export type BearThesis = z.infer<typeof BearSchema>;

export const RebuttalSchema = z.object({
  rebuttal_md: z.string(),
});
export type Rebuttal = z.infer<typeof RebuttalSchema>;

export const VerdictSchema = z.object({
  summary: z.string(),
  recommendation: z.enum(["BUY", "HOLD", "TRIM", "AVOID"]),
  conviction: z.enum(["HIGH", "MEDIUM", "LOW"]),
  bull_case: z.array(ClaimSchema).default([]),
  bear_case: z.array(ClaimSchema).default([]),
  what_would_change_mind: z.array(z.string()).default([]),
  target_price_range: z.object({
    low: z.number(),
    high: z.number(),
    timeframe: z.string().default("12 months"),
  }),
  trade_plan: z.object({
    position_size_pct: z.number(),
    stop_price: z.number().nullable().default(null),
    rationale: z.string().default(""),
  }),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export const CritiqueSchema = z.object({
  should_revise_verdict: z.boolean().default(false),
  revision_suggestion: z.string().default(""),
  notes_md: z.string().default(""),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export const MemoSchema = z.object({
  delta_summary: z.string().default(""),
  sections: z.record(z.string()).default({}),
});
export type MemoDelta = z.infer<typeof MemoSchema>;
