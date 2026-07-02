import { completeJson } from "../analyst/llmjson";
import type { Provider } from "../analyst/types";
import { settings } from "../config/settings";
import type { EvidenceLedger } from "../tools/evidence-ledger";
import type { SectorAnalyzer } from "./analyzers";
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
};

const evidence = (ctx: AgentCtx): string =>
  ctx.ledger.evidencePrompt(settings.evidence.maxCharsPerTool) || "(no evidence gathered yet)";

export async function runPlanner(
  provider: Provider,
  ctx: AgentCtx,
  toolCatalog: string,
  iteration: number,
): Promise<Plan> {
  const system =
    "You are the research planner. Choose the next tools to call to build a complete evidence base. Return STRICT JSON only.";
  const user = `TICKER: ${ctx.symbol}\n${ctx.analyzer.promptPrefix}\nIteration ${iteration}. Suggested tools for this sector: ${ctx.analyzer.requiredTools.join(", ")}.\n\nAVAILABLE TOOLS:\n${toolCatalog}\n\nEVIDENCE SO FAR:\n${evidence(ctx)}\n\nReturn {"done": bool, "summary": str, "next_calls": [{"tool","args","reason"}]}. Set done=true when evidence is sufficient for a full bull/bear debate.`;
  return (await completeJson(provider, { system, user }, PlanSchema, { thinking: true })).data;
}

export async function runBull(provider: Provider, ctx: AgentCtx): Promise<BullThesis> {
  const system =
    "You are the BULL analyst. Argue the strongest evidence-based case FOR the stock. Every point must cite a tool via evidence_refs. STRICT JSON only.";
  const user = `TICKER: ${ctx.symbol}\n${ctx.analyzer.promptPrefix}\n\nEVIDENCE:\n${evidence(ctx)}\n\nReturn {"thesis_md", "points":[{"claim","evidence_refs","confidence"}]}.`;
  return (await completeJson(provider, { system, user }, BullSchema, { thinking: true })).data;
}

export async function runBear(
  provider: Provider,
  ctx: AgentCtx,
  bull: BullThesis,
): Promise<BearThesis> {
  const system =
    "You are the BEAR analyst. Attack the bull case AND make an independent bear case. Cite tools. STRICT JSON only.";
  const user = `TICKER: ${ctx.symbol}\n\nBULL CASE:\n${bull.thesis_md}\n\nEVIDENCE:\n${evidence(ctx)}\n\nReturn {"independent_bear_md","attack_md","points":[{"claim","evidence_refs","confidence"}]}.`;
  return (await completeJson(provider, { system, user }, BearSchema, { thinking: true })).data;
}

export async function runRebuttal(
  provider: Provider,
  ctx: AgentCtx,
  bull: BullThesis,
  bear: BearThesis,
): Promise<Rebuttal> {
  const system = "You are the bull defending against the bear's attack. STRICT JSON only.";
  const user = `TICKER: ${ctx.symbol}\n\nBULL:\n${bull.thesis_md}\n\nBEAR ATTACK:\n${bear.attack_md}\n\nReturn {"rebuttal_md"}.`;
  return (await completeJson(provider, { system, user }, RebuttalSchema, { thinking: true })).data;
}

export type JudgeInput = {
  bull: BullThesis;
  bear: BearThesis;
  rebuttal: Rebuttal;
  currentPrice: number;
  revisionNote?: string;
};

const JUDGE_SYSTEM =
  "You are an investment analyst allocating real capital. Weigh bull, bear, and rebuttal; set conviction honestly (HIGH only when the bull is strong AND the bear is addressed); give >=3 monitorable falsifiability conditions and a trade plan with position_size_pct 0-15. If AVOID, size=0. STRICT JSON only.";

export async function runJudge(
  provider: Provider,
  ctx: AgentCtx,
  input: JudgeInput,
): Promise<Verdict> {
  const rev = input.revisionNote ? `\n\nRISK-OFFICER REVISION REQUEST:\n${input.revisionNote}` : "";
  const user = `TICKER: ${ctx.symbol}\nCURRENT PRICE: ${input.currentPrice}\n${ctx.analyzer.promptPrefix}\n\nEVIDENCE:\n${evidence(ctx)}\n\nBULL:\n${input.bull.thesis_md}\n\nBEAR:\n${input.bear.independent_bear_md}\n\nREBUTTAL:\n${input.rebuttal.rebuttal_md}${rev}\n\nReturn the verdict JSON.`;
  const verdict = (await completeJson(provider, { system: JUDGE_SYSTEM, user }, VerdictSchema, { thinking: true })).data;
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
  const system =
    "You are the risk officer reviewing the verdict for overconfidence, unaddressed bear points, or evidence gaps. STRICT JSON only.";
  const user = `TICKER: ${ctx.symbol}\n\nVERDICT:\n${JSON.stringify(verdict)}\n\nReturn {"should_revise_verdict","revision_suggestion","notes_md"}.`;
  return (await completeJson(provider, { system, user }, CritiqueSchema, { thinking: true })).data;
}

export async function runMemo(
  provider: Provider,
  ctx: AgentCtx,
  verdict: Verdict,
): Promise<MemoDelta> {
  const system =
    "You synthesize a Living Memo delta from the verdict. Narration only — no new facts. STRICT JSON only.";
  const user = `TICKER: ${ctx.symbol}\n\nVERDICT:\n${JSON.stringify(verdict)}\n\nReturn {"delta_summary","sections":{section_name: content_md}}.`;
  // Narration role → thinking OFF.
  return (await completeJson(provider, { system, user }, MemoSchema, { thinking: false })).data;
}
