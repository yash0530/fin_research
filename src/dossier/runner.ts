import { EvidenceLedger } from "../tools/evidence-ledger";
import { execute, type ToolResult } from "../tools/types";
import type { ToolRegistry } from "../tools/registry";
import type { Budget } from "../tools/budget";
import { withLlmLock } from "../analyst/singleflight";
import { LlmJsonError } from "../analyst/llmjson";
import type { Provider } from "../analyst/types";
import { settings, thinkingForRole, type AgentRole } from "../config/settings";
import { classify } from "./analyzers";
import {
  runPlanner,
  runBull,
  runBear,
  runRebuttal,
  runJudge,
  runCritique,
  runMemo,
  type AgentCtx,
} from "./agents";
import { validateVerdict } from "./evidence-validation";
import type { DossierState, DossierStore } from "./state";
import type { Verdict } from "./schemas";

export type GovernFn = (conviction: string, judgeSize: number) => { governed: number; reason: string };

/** Default governor used at dossier time (full history-aware governor lives in
 *  src/calibration). Unproven tiers cap at the conservative 2%. */
const defaultGovern: GovernFn = (conviction, judgeSize) => {
  const CAP = 2.0;
  if (judgeSize <= CAP) return { governed: judgeSize, reason: "" };
  return {
    governed: CAP,
    reason: `unproven ${conviction} tier — capped to ${CAP}% until calibration is earned`,
  };
};

export type RunnerDeps = {
  store: DossierStore;
  registry: ToolRegistry;
  providerFor: (role: AgentRole) => Provider;
  budget: Budget;
  currentPrice?: number;
  /** Living-Memo summary for the symbol (loaded by the caller; threads to planner + judge). */
  memoSummary?: string;
  governSize?: GovernFn;
  now?: () => number;
};

/** Fallback verdict when the judge LLM fails — a dossier never crashes. */
export function fallbackVerdict(currentPrice: number, error: string): Verdict {
  return {
    summary: `Judge unavailable: ${error}`.slice(0, 200),
    recommendation: "HOLD",
    conviction: "LOW",
    bull_case: [],
    bear_case: [],
    what_would_change_mind: ["Re-run the dossier once the model returns valid output"],
    target_price_range: { low: currentPrice, high: currentPrice, timeframe: "N/A" },
    trade_plan: { position_size_pct: 0, stop_price: null, rationale: "No verdict — do not size" },
  };
}

function metered(provider: Provider, budget: Budget): Provider {
  return {
    name: provider.name,
    endpointKey: provider.endpointKey,
    complete: async (msg, opts) => {
      budget.chargeLlm();
      return provider.complete(msg, opts);
    },
  };
}

export async function runDossier(id: string, deps: RunnerDeps): Promise<DossierState> {
  const now = deps.now ?? Date.now;
  const state = deps.store.load(id);
  if (!state) throw new Error(`dossier ${id} not found`);

  const persist = (): void => {
    state.updatedAt = now();
    deps.store.save(state);
  };
  const bail = (reason: string): DossierState => {
    state.status = "failed";
    state.error = reason;
    persist();
    return state;
  };
  const call = <T>(role: AgentRole, fn: (p: Provider) => Promise<T>): Promise<T> => {
    const p = deps.providerFor(role);
    const mp = metered(p, deps.budget);
    return withLlmLock(p.endpointKey, () => fn(mp));
  };

  state.status = "running";
  state.startedAt = state.startedAt ?? now();
  persist();

  const analyzer = classify(state.symbol, state.sectorCode);
  const ledger = new EvidenceLedger(state.symbol);
  for (const tc of state.toolCalls) ledger.add(tc); // rebuild from persisted tool calls
  const ctx: AgentCtx = { symbol: state.symbol, analyzer, ledger, memoSummary: deps.memoSummary };
  const currentPrice = deps.currentPrice ?? 0;
  const govern = deps.governSize ?? defaultGovern;

  try {
    if (!state.stages.classify) {
      state.stages.classify = { name: "classify", output: { analyzer: analyzer.key }, at: now() };
      persist();
    }

    // ── Planner / executor loop ─────────────────────────────
    if (!state.stages.research) {
      const catalog = deps.registry.promptCatalog();
      for (let it = 0; it < settings.dossier.plannerMaxIterations; it++) {
        if (deps.budget.exhausted()) return bail(deps.budget.reason() ?? "budget exhausted");
        const plan = await call("planner", (p) => runPlanner(p, ctx, catalog, it));
        for (const c of plan.next_calls) {
          const tool = deps.registry.get(c.tool);
          if (!tool) {
            const miss: ToolResult = {
              tool: c.tool,
              data: {},
              sources: [],
              confidence: "low",
              cached: false,
              error: `tool '${c.tool}' not registered`,
            };
            ledger.add(miss);
            state.toolCalls.push(miss);
            continue;
          }
          const res = await execute(tool, c.args, now);
          deps.budget.chargeTool();
          ledger.add(res);
          state.toolCalls.push(res);
        }
        persist();
        if (plan.done) break;
      }
      state.stages.research = { name: "research", output: { tools: ledger.citableTools() }, at: now() };
      persist();
    }

    // ── Debate ──────────────────────────────────────────────
    if (deps.budget.exhausted()) return bail(deps.budget.reason() ?? "budget exhausted");
    if (!state.stages.bull) {
      state.bull = await call("bull", (p) => runBull(p, ctx));
      state.stages.bull = { name: "bull", output: state.bull, at: now() };
      persist();
    }
    const bull = state.bull;
    if (!bull) return bail("bull stage produced no output");

    if (deps.budget.exhausted()) return bail(deps.budget.reason() ?? "budget exhausted");
    if (!state.stages.bear) {
      state.bear = await call("bear", (p) => runBear(p, ctx, bull));
      state.stages.bear = { name: "bear", output: state.bear, at: now() };
      persist();
    }
    const bear = state.bear;
    if (!bear) return bail("bear stage produced no output");

    if (deps.budget.exhausted()) return bail(deps.budget.reason() ?? "budget exhausted");
    if (!state.stages.rebuttal) {
      state.rebuttal = await call("rebuttal", (p) => runRebuttal(p, ctx, bull, bear));
      state.stages.rebuttal = { name: "rebuttal", output: state.rebuttal, at: now() };
      persist();
    }
    const rebuttal = state.rebuttal;
    if (!rebuttal) return bail("rebuttal stage produced no output");

    // ── Judge (with fallback + citation validation) ─────────
    if (deps.budget.exhausted()) return bail(deps.budget.reason() ?? "budget exhausted");
    if (!state.stages.judge) {
      let verdict: Verdict;
      try {
        verdict = await call("judge", (p) =>
          runJudge(p, ctx, { bull, bear, rebuttal, currentPrice }),
        );
      } catch (e) {
        if (e instanceof LlmJsonError) verdict = fallbackVerdict(currentPrice, e.message);
        else throw e;
      }
      const { verdict: cleaned, report } = validateVerdict(verdict, ledger.citableTools());
      state.verdict = cleaned;
      state.droppedClaims = report.droppedBull + report.droppedBear;
      state.stages.judge = { name: "judge", output: cleaned, at: now() };
      persist();
    }

    // ── Critique → optional single revision ─────────────────
    if (!state.stages.critique) {
      const critique = await call("critique", (p) => runCritique(p, ctx, state.verdict as Verdict));
      state.critique = critique;
      state.stages.critique = { name: "critique", output: critique, at: now() };
      persist();
      if (critique.should_revise_verdict && !state.stages.judge_rev && !deps.budget.exhausted()) {
        try {
          const revised = await call("judge", (p) =>
            runJudge(p, ctx, {
              bull,
              bear,
              rebuttal,
              currentPrice,
              revisionNote: critique.revision_suggestion,
            }),
          );
          const { verdict: cleaned } = validateVerdict(revised, ledger.citableTools());
          state.verdict = cleaned;
          state.stages.judge_rev = { name: "judge_rev", output: cleaned, at: now() };
          persist();
        } catch (e) {
          if (!(e instanceof LlmJsonError)) throw e; // keep original verdict on revision failure
        }
      }
    }

    // ── Memo synthesis (staged) ─────────────────────────────
    if (!state.stages.memo) {
      state.memo = await call("memoSynth", (p) => runMemo(p, ctx, state.verdict as Verdict));
      state.stages.memo = { name: "memo", output: state.memo, at: now() };
      persist();
    }

    // ── RecCall (governed size) ─────────────────────────────
    const v = state.verdict as Verdict;
    const judgeSize = v.trade_plan.position_size_pct;
    const { governed, reason } = govern(v.conviction, judgeSize);
    state.recCall = {
      dossierId: id,
      symbol: state.symbol,
      action: v.recommendation,
      conviction: v.conviction,
      priceAtCall: currentPrice,
      targetLow: v.target_price_range.low,
      targetHigh: v.target_price_range.high,
      stopPrice: v.trade_plan.stop_price,
      judgeSizePct: judgeSize,
      governedSizePct: governed,
      governorReason: reason,
      model: deps.providerFor("judge").name,
      thinkingMode: thinkingForRole("judge"),
      createdAt: now(),
      outcome1mPct: null,
      outcome3mPct: null,
      outcome6mPct: null,
      outcome1yPct: null,
      thesisFalsified: null,
    };

    state.status = "done";
    persist();
    return state;
  } catch (e) {
    state.status = "failed";
    state.error = e instanceof Error ? e.message : String(e);
    persist();
    return state;
  }
}
