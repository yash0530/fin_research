import { describe, it, expect, beforeEach } from "vitest";
import { FakeProvider } from "../analyst/fake-provider";
import { _resetLocks } from "../analyst/singleflight";
import { ToolRegistry } from "../tools/registry";
import { Budget } from "../tools/budget";
import type { Tool } from "../tools/types";
import type { AgentRole } from "../config/settings";
import { InMemoryDossierStore, newDossier, type DossierStore } from "./state";
import { runDossier, type RunnerDeps } from "./runner";

const fundamentalsTool: Tool = {
  name: "fundamentals",
  describe: () => "local fundamentals",
  run: async () => ({ data: { current_price: 100, revenue: 1000 }, sources: [{ label: "local" }] }),
};

const SCRIPTS: Record<string, string> = {
  planner: '{"done":true,"summary":"enough","next_calls":[{"tool":"fundamentals","args":{},"reason":"need it"}]}',
  bull: '{"thesis_md":"Strong demand cycle","points":[{"claim":"revenue up","evidence_refs":["fundamentals"],"confidence":"high"}]}',
  bear: '{"independent_bear_md":"Cyclical","attack_md":"ignores cycle","points":[{"claim":"cycle risk","evidence_refs":["fundamentals"]}]}',
  rebuttal: '{"rebuttal_md":"Cycle already priced in"}',
  judge:
    '{"summary":"Buy","recommendation":"BUY","conviction":"MEDIUM","bull_case":[{"claim":"revenue up","evidence_refs":["fundamentals"],"confidence":"high"}],"bear_case":[{"claim":"cycle","evidence_refs":["fundamentals"]}],"what_would_change_mind":["a","b","c"],"target_price_range":{"low":110,"high":150,"timeframe":"12 months"},"trade_plan":{"position_size_pct":5,"stop_price":90,"rationale":"sized"}}',
  critique: '{"should_revise_verdict":false,"revision_suggestion":"","notes_md":"ok"}',
  memo: '{"delta_summary":"updated","sections":{"thesis":"buy thesis"}}',
};

function makeProviders(overrides: Partial<Record<AgentRole, string[]>> = {}) {
  const map = new Map<AgentRole, FakeProvider>();
  const providerFor = (role: AgentRole): FakeProvider => {
    let p = map.get(role);
    if (!p) {
      const scripts = overrides[role] ?? [SCRIPTS[role] ?? "{}"];
      p = new FakeProvider(scripts, "fake://local");
      map.set(role, p);
    }
    return p;
  };
  return { providerFor, map };
}

function deps(providerFor: (r: AgentRole) => FakeProvider, store: DossierStore, budget?: Budget): RunnerDeps {
  return {
    store,
    registry: new ToolRegistry().register(fundamentalsTool),
    providerFor,
    budget: budget ?? new Budget({ maxWallClockSec: 2700, maxLlmCalls: 24, maxToolCalls: 40 }),
    currentPrice: 100,
  };
}

describe("runDossier", () => {
  beforeEach(() => _resetLocks());

  it("happy path: full debate → BUY verdict + governed RecCall + all stages", async () => {
    const store = new InMemoryDossierStore();
    store.save(newDossier("d1", "MU"));
    const { providerFor } = makeProviders();
    const res = await runDossier("d1", deps(providerFor, store));

    expect(res.status).toBe("done");
    expect(res.verdict?.recommendation).toBe("BUY");
    expect(res.droppedClaims).toBe(0);
    // Governor caps the judge's 5% to the 2% conservative cap for an unproven tier.
    expect(res.recCall?.judgeSizePct).toBe(5);
    expect(res.recCall?.governedSizePct).toBe(2);
    expect(res.recCall?.governorReason).toMatch(/capped/);
    for (const stage of ["classify", "research", "bull", "bear", "rebuttal", "judge", "critique", "memo"]) {
      expect(res.stages[stage as keyof typeof res.stages]).toBeDefined();
    }
  });

  it("drops uncited claims from the verdict (no naked numbers)", async () => {
    const store = new InMemoryDossierStore();
    store.save(newDossier("d2", "MU"));
    const badJudge =
      '{"summary":"Buy","recommendation":"BUY","conviction":"LOW","bull_case":[{"claim":"cited","evidence_refs":["fundamentals"]},{"claim":"naked","evidence_refs":["rumor"]}],"bear_case":[],"what_would_change_mind":["a","b","c"],"target_price_range":{"low":1,"high":2,"timeframe":"12m"},"trade_plan":{"position_size_pct":1,"stop_price":null,"rationale":"x"}}';
    const { providerFor } = makeProviders({ judge: [badJudge] });
    const res = await runDossier("d2", deps(providerFor, store));

    expect(res.verdict?.bull_case).toHaveLength(1); // "naked" dropped
    expect(res.verdict?.bull_case[0]?.claim).toBe("cited");
    expect(res.droppedClaims).toBe(1);
  });

  it("judge fallback: malformed judge output yields a HOLD/LOW verdict, never crashes", async () => {
    const store = new InMemoryDossierStore();
    store.save(newDossier("d3", "MU"));
    const { providerFor } = makeProviders({ judge: ["not json at all"] });
    const res = await runDossier("d3", deps(providerFor, store));

    expect(res.status).toBe("done");
    expect(res.verdict?.recommendation).toBe("HOLD");
    expect(res.verdict?.conviction).toBe("LOW");
    expect(res.recCall?.governedSizePct).toBe(0);
  });

  it("budget exhaustion: fails cleanly with a partial transcript", async () => {
    const store = new InMemoryDossierStore();
    store.save(newDossier("d4", "MU"));
    const { providerFor } = makeProviders({
      planner: ['{"done":true,"summary":"stop","next_calls":[]}'],
    });
    const tightBudget = new Budget({ maxWallClockSec: 9999, maxLlmCalls: 1, maxToolCalls: 40 });
    const res = await runDossier("d4", deps(providerFor, store, tightBudget));

    expect(res.status).toBe("failed");
    expect(res.error).toMatch(/LLM-call cap/);
    expect(res.stages.research).toBeDefined(); // planner ran
    expect(res.stages.bull).toBeUndefined(); // bailed before the debate
  });

  it("resume after bear: bull/bear reused, not re-run", async () => {
    const store = new InMemoryDossierStore();
    store.save(newDossier("d5", "MU"));

    // First run crashes at rebuttal (garbage that never validates).
    const run1 = makeProviders({ rebuttal: ["garbage"] });
    const first = await runDossier("d5", deps(run1.providerFor, store));
    expect(first.status).toBe("failed");
    expect(first.stages.bull).toBeDefined();
    expect(first.stages.bear).toBeDefined();
    expect(first.stages.rebuttal).toBeUndefined();

    // Second run with fresh providers; bull/bear must be reused (0 calls).
    const run2 = makeProviders();
    const second = await runDossier("d5", deps(run2.providerFor, store));
    expect(second.status).toBe("done");
    expect(run2.map.get("bull")?.callCount ?? 0).toBe(0);
    expect(run2.map.get("bear")?.callCount ?? 0).toBe(0);
    expect(run2.map.get("rebuttal")?.callCount).toBeGreaterThan(0);
    expect(second.verdict?.recommendation).toBe("BUY");
  });
});
