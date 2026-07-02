import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { _resetLocks } from "../analyst/singleflight";
import { FakeProvider } from "../analyst/fake-provider";
import { ToolRegistry } from "../tools/registry";
import { Budget } from "../tools/budget";
import type { Tool } from "../tools/types";
import { newDossier } from "../dossier/state";
import { runDossier } from "../dossier/runner";
import { SqliteDossierStore } from "./sqlite-store";
import type { SqlDb } from "./migrate";

// node:sqlite via createRequire (vite-safe) + typed.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

const fundamentals: Tool = {
  name: "fundamentals",
  describe: () => "f",
  run: async () => ({ data: { current_price: 90 }, sources: [{ label: "local" }] }),
};

// Scripts in dossier CALL ORDER: [planner, bull, bear, rebuttal, judge, critique, memo].
const SCRIPTS: string[] = [
  '{"done":true,"summary":"ok","next_calls":[{"tool":"fundamentals","args":{}}]}',
  '{"thesis_md":"HBM","points":[{"claim":"rev up","evidence_refs":["fundamentals"]}]}',
  '{"independent_bear_md":"cycle","attack_md":"c","points":[]}',
  '{"rebuttal_md":"priced in"}',
  '{"summary":"Buy","recommendation":"BUY","conviction":"MEDIUM","bull_case":[{"claim":"rev up","evidence_refs":["fundamentals"]}],"bear_case":[],"what_would_change_mind":["a","b","c"],"target_price_range":{"low":110,"high":150,"timeframe":"12m"},"trade_plan":{"position_size_pct":5,"stop_price":80,"rationale":"x"}}',
  '{"should_revise_verdict":false}',
  '{"delta_summary":"u","sections":{}}',
];

// A single provider instance shared across stages so scripts advance in call order.
function deps(store: SqliteDossierStore, provider: FakeProvider) {
  return {
    store,
    registry: new ToolRegistry().register(fundamentals),
    providerFor: () => provider,
    budget: new Budget({ maxWallClockSec: 2700, maxLlmCalls: 24, maxToolCalls: 40 }),
    currentPrice: 90,
  };
}

describe("SqliteDossierStore (durable persistence + resume)", () => {
  it("persists a completed dossier to a real SQLite DB and reloads it", async () => {
    _resetLocks();
    const db = new DatabaseSync(":memory:") as unknown as SqlDb;
    const store = new SqliteDossierStore(db);
    store.save(newDossier("dsr_MU", "MU", { sectorCode: "ai_memory" }));

    const res = await runDossier("dsr_MU", deps(store, new FakeProvider(SCRIPTS)));
    expect(res.status).toBe("done");

    // A brand-new store over the SAME db sees the persisted, completed dossier.
    const store2 = new SqliteDossierStore(db);
    const reloaded = store2.load("dsr_MU");
    expect(reloaded?.status).toBe("done");
    expect(reloaded?.verdict?.recommendation).toBe("BUY");
    expect(store2.all()).toHaveLength(1);
  });

  it("resumes from a persisted mid-run state without re-running earlier stages", async () => {
    _resetLocks();
    const db = new DatabaseSync(":memory:") as unknown as SqlDb;
    const store = new SqliteDossierStore(db);
    store.save(newDossier("dsr_X", "MU", { sectorCode: "ai_memory" }));

    // First run crashes at rebuttal (garbage never validates) → bull/bear persisted to DB.
    const run1 = new FakeProvider([SCRIPTS[0], SCRIPTS[1], SCRIPTS[2], "garbage"]);
    const first = await runDossier("dsr_X", deps(store, run1));
    expect(first.status).toBe("failed");
    expect(store.load("dsr_X")?.stages.bear).toBeDefined();

    // Fresh store + provider (scripted from the rebuttal stage) over the SAME db → resumes.
    const run2 = new FakeProvider(SCRIPTS.slice(3)); // [rebuttal, judge, critique, memo]
    const store2 = new SqliteDossierStore(db);
    const second = await runDossier("dsr_X", deps(store2, run2));
    expect(second.status).toBe("done");
    expect(second.verdict?.recommendation).toBe("BUY");
    expect(run2.callCount).toBe(4); // bull/bear reused → only rebuttal→memo ran
  });
});
