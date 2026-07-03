import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { _resetLocks } from "../analyst/singleflight";
import { FakeProvider } from "../analyst/fake-provider";
import { applyMigrations, type SqlDb } from "../db/migrate";
import { upsertTicker, insertPrices, insertFundamentals, type PriceRow } from "../db/queries";
import { SqliteDossierStore } from "../db/sqlite-store";
import { newDossier, type DossierState } from "./state";
import { runDossierJob } from "./job";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
// All migrations so additive columns (e.g. promptVersion) are present.
const ALL_MIGRATIONS = readdirSync("prisma/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((name) => ({ name: name.replace(/\.sql$/, ""), sql: readFileSync(join("prisma/migrations", name), "utf8") }));

// dossier CALL ORDER: [planner, bull, bear, rebuttal, judge, critique, memo].
const SCRIPTS: string[] = [
  '{"done":true,"summary":"ok","next_calls":[{"tool":"fundamentals","args":{}}]}',
  '{"thesis_md":"HBM upcycle","points":[{"claim":"rev up","evidence_refs":["fundamentals"]}]}',
  '{"independent_bear_md":"cyclical","attack_md":"ignores cycle","points":[]}',
  '{"rebuttal_md":"priced in"}',
  '{"summary":"Buy","recommendation":"BUY","conviction":"MEDIUM","bull_case":[{"claim":"rev up","evidence_refs":["fundamentals"]}],"bear_case":[],"what_would_change_mind":["a","b","c"],"target_price_range":{"low":110,"high":150,"timeframe":"12m"},"trade_plan":{"position_size_pct":5,"stop_price":80,"rationale":"x"}}',
  '{"should_revise_verdict":false}',
  '{"delta_summary":"u","sections":{}}',
];

function seedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, ALL_MIGRATIONS);
  upsertTicker(db, { symbol: "MU", name: "Micron" });
  const base = Date.parse("2025-01-01T00:00:00Z");
  const prices: PriceRow[] = Array.from({ length: 30 }, (_, i) => ({
    symbol: "MU",
    d: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    close: 90 + i,
    volume: 1_000_000,
  }));
  insertPrices(db, prices);
  insertFundamentals(db, [
    { symbol: "MU", periodEnd: "2024-12-01", revenue: 6000, grossProfit: 2500, netIncome: 1000, fcf: 800, totalAssets: 40000, totalDebt: 12000, cash: 5000, sharesOut: 1100 },
  ]);
  return db;
}

function recCallRow(db: SqlDb, dossierId: string): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM "RecCall" WHERE "dossierId"=?').get(dossierId) as
    | Record<string, unknown>
    | undefined;
}

describe("runDossierJob (live wiring path, driven by FakeProvider + temp DB)", () => {
  beforeEach(() => _resetLocks());

  it("enqueues, runs the debate over the production registry, and persists a governed RecCall", async () => {
    const db = seedDb();
    const provider = new FakeProvider(SCRIPTS);
    const logs: string[] = [];
    const { enqueued, ran } = await runDossierJob(db, ["MU"], {
      providerFor: () => provider,
      log: (m) => logs.push(m),
    });

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].enqueued).toBe(true);
    expect(ran).toHaveLength(1);
    expect(ran[0].status).toBe("done");
    expect(ran[0].recommendation).toBe("BUY");

    // Stages persisted to the durable store.
    const store = new SqliteDossierStore(db);
    const state = store.load(ran[0].id)!;
    for (const stage of ["classify", "research", "bull", "bear", "rebuttal", "judge", "critique", "memo"]) {
      expect(state.stages[stage as keyof typeof state.stages]).toBeDefined();
    }

    // Governed RecCall row written (5% judge → 2% conservative cap, unproven tier).
    const rc = recCallRow(db, ran[0].id);
    expect(rc).toBeDefined();
    expect(rc!.action).toBe("BUY");
    expect(Number(rc!.judgeSizePct)).toBe(5);
    expect(Number(rc!.governedSizePct)).toBe(2);
    expect(String(rc!.governorReason)).toMatch(/capped|calibration/i);

    // The CEO's silence-is-unacceptable requirement: stage transitions were logged.
    expect(logs.some((l) => l.includes("stage judge"))).toBe(true);
  });

  it("dedupes a second enqueue of the same symbol", async () => {
    const db = seedDb();
    const provider = new FakeProvider(SCRIPTS);
    await runDossierJob(db, ["MU"], { providerFor: () => provider });

    const provider2 = new FakeProvider(SCRIPTS);
    const { enqueued, ran } = await runDossierJob(db, ["MU"], { providerFor: () => provider2 });
    expect(enqueued[0].enqueued).toBe(false); // deduped against the recent run
    expect(ran).toHaveLength(0); // nothing new to drain
  });

  it("resumes a mid-run dossier without re-running completed stages", async () => {
    const db = seedDb();
    const store = new SqliteDossierStore(db);

    // Pre-populate a queued dossier whose classify/research/bull/bear already ran.
    const pre: DossierState = newDossier("dsr_resume", "MU", { sectorCode: "ai_memory" });
    pre.status = "queued";
    pre.bull = { thesis_md: "HBM", points: [] };
    pre.bear = { independent_bear_md: "cycle", attack_md: "c", points: [] };
    const at = Date.now();
    pre.stages = {
      classify: { name: "classify", output: {}, at },
      research: { name: "research", output: { tools: [] }, at },
      bull: { name: "bull", output: pre.bull, at },
      bear: { name: "bear", output: pre.bear, at },
    };
    store.save(pre);

    // Provider is scripted only from the rebuttal stage onward.
    const provider = new FakeProvider(SCRIPTS.slice(3)); // [rebuttal, judge, critique, memo]
    const { ran } = await runDossierJob(db, undefined, { providerFor: () => provider });

    expect(ran).toHaveLength(1);
    expect(ran[0].status).toBe("done");
    expect(ran[0].recommendation).toBe("BUY");
    expect(provider.callCount).toBe(4); // planner/bull/bear reused → only rebuttal→memo ran
  });
});
