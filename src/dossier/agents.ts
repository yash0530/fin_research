import { completeJson } from "../analyst/llmjson";
import type { Provider } from "../analyst/types";
import { settings } from "../config/settings";
import type { EvidenceLedger } from "../tools/evidence-ledger";
import type { SectorAnalyzer } from "./analyzers";
import * as planner from "./prompts/planner";
import * as bull from "./prompts/bull";
import * as bear from "./prompts/bear";
import * as rebuttal from "./prompts/rebuttal";
import * as judge from "./prompts/judge";
import * as critique from "./prompts/critique";
import * as memo from "./prompts/memo";
import {
  PlanSchema,
  BullSchema,
  BearSchema,
  RebuttalSchema,
  VerdictSchema,
  CritiqueSchema,
  MemoSchema,
  type Plan,
  type BullThesis,
  type BearThesis,
  type Rebuttal,
  type Verdict,
  type Critique,
  type MemoDelta,
} from "./schemas";

export type AgentCtx = {
  symbol: string;
  analyzer: SectorAnalyzer;
  ledger: EvidenceLedger;
  /** Living-Memo summary for this ticker (donor fidelity: planner + judge see it). */
  memoSummary?: string;
};

const evidence = (ctx: AgentCtx): string =>
  ctx.ledger.evidencePrompt(settings.evidence.maxCharsPerTool) || "(no evidence gathered yet)";

export async function runPlanner(
  provider: Provider,
  ctx: AgentCtx,
  toolCatalog: string,
  iteration: number,
): Promise<Plan> {
  const user = planner.user({
    symbol: ctx.symbol,
    promptPrefix: ctx.analyzer.promptPrefix,
    requiredTools: ctx.analyzer.requiredTools,
    iteration,
    toolCatalog,
    evidence: evidence(ctx),
    memoSummary: ctx.memoSummary,
  });
  return (await completeJson(provider, { system: planner.system, user }, PlanSchema, { thinking: true })).data;
}

export async function runBull(provider: Provider, ctx: AgentCtx): Promise<BullThesis> {
  const user = bull.user({
    symbol: ctx.symbol,
    promptPrefix: ctx.analyzer.promptPrefix,
    evidence: evidence(ctx),
  });
  return (await completeJson(provider, { system: bull.system, user }, BullSchema, { thinking: true })).data;
}

export async function runBear(
  provider: Provider,
  ctx: AgentCtx,
  bullThesis: BullThesis,
): Promise<BearThesis> {
  const user = bear.user({
    symbol: ctx.symbol,
    promptPrefix: ctx.analyzer.promptPrefix,
    bullThesisMd: bullThesis.thesis_md,
    evidence: evidence(ctx),
  });
  return (await completeJson(provider, { system: bear.system, user }, BearSchema, { thinking: true })).data;
}

export async function runRebuttal(
  provider: Provider,
  ctx: AgentCtx,
  bullThesis: BullThesis,
  bearThesis: BearThesis,
): Promise<Rebuttal> {
  const user = rebuttal.user({
    symbol: ctx.symbol,
    bullThesisMd: bullThesis.thesis_md,
    bearAttackMd: bearThesis.attack_md,
    independentBearMd: bearThesis.independent_bear_md,
    evidence: evidence(ctx),
  });
  return (await completeJson(provider, { system: rebuttal.system, user }, RebuttalSchema, { thinking: true })).data;
}

export type JudgeInput = {
  bull: BullThesis;
  bear: BearThesis;
  rebuttal: Rebuttal;
  currentPrice: number;
  revisionNote?: string;
};

export async function runJudge(
  provider: Provider,
  ctx: AgentCtx,
  input: JudgeInput,
): Promise<Verdict> {
  const user = judge.user({
    symbol: ctx.symbol,
    promptPrefix: ctx.analyzer.promptPrefix,
    currentPrice: input.currentPrice,
    memoSummary: ctx.memoSummary,
    evidence: evidence(ctx),
    bullMd: input.bull.thesis_md,
    bearAttackMd: input.bear.attack_md,
    independentBearMd: input.bear.independent_bear_md,
    rebuttalMd: input.rebuttal.rebuttal_md,
    revisionNote: input.revisionNote,
  });
  const verdict = (await completeJson(provider, { system: judge.system, user }, VerdictSchema, { thinking: true })).data;
  // Clamp the position size to the contract's 0..15 band.
  const size = verdict.trade_plan.position_size_pct;
  verdict.trade_plan.position_size_pct = Math.max(0, Math.min(15, Number.isFinite(size) ? size : 0));
  if (verdict.recommendation === "AVOID") verdict.trade_plan.position_size_pct = 0;
  return verdict;
}

export async function runCritique(
  provider: Provider,
  ctx: AgentCtx,
  verdict: Verdict,
): Promise<Critique> {
  const user = critique.user({
    symbol: ctx.symbol,
    verdictJson: JSON.stringify(verdict),
    evidence: evidence(ctx),
  });
  return (await completeJson(provider, { system: critique.system, user }, CritiqueSchema, { thinking: true })).data;
}

export async function runMemo(
  provider: Provider,
  ctx: AgentCtx,
  verdict: Verdict,
): Promise<MemoDelta> {
  const user = memo.user({
    symbol: ctx.symbol,
    verdictJson: JSON.stringify(verdict),
    evidence: evidence(ctx),
  });
  // Narration role → thinking OFF.
  return (await completeJson(provider, { system: memo.system, user }, MemoSchema, { thinking: false })).data;
}
