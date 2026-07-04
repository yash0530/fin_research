import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { applyMigrations, type SqlDb } from "./migrate";
import {
  insertPrices,
  loadCloses,
  saveDigest,
  loadLatestDigest,
  saveRecCall,
  loadRecCallsForGovernor,
  updateRecCallOutcome,
  closesBetween,
  symbolClosesUpTo,
} from "./queries";
import { governSize } from "../calibration/governor";
import type { RecCall } from "../dossier/state";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

// Apply ALL migrations (not just 0001) so additive columns like promptVersion land.
const ALL_MIGRATIONS = readdirSync("prisma/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((name) => ({ name: name.replace(/\.sql$/, ""), sql: readFileSync(join("prisma/migrations", name), "utf8") }));

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, ALL_MIGRATIONS);
  return db;
}

const rc = (dossierId: string, over: Partial<RecCall> = {}): RecCall => ({
  dossierId,
  symbol: "MU",
  action: "BUY",
  conviction: "HIGH",
  priceAtCall: 90,
  targetLow: 110,
  targetHigh: 150,
  stopPrice: 80,
  judgeSizePct: 10,
  governedSizePct: 2,
  governorReason: "",
  model: "fake",
  thinkingMode: true,
  promptVersion: "v1",
  createdAt: Date.now(),
  outcome1mPct: null,
  outcome3mPct: 10,
  outcome6mPct: null,
  outcome1yPct: null,
  thesisFalsified: null,
  ...over,
});

describe("data-access layer (real migrated DB)", () => {
  it("inserts prices (dup-ignored) and reads back despiked closes", () => {
    const db = migratedDb();
    const rows = Array.from({ length: 12 }, (_, i) => ({ symbol: "MU", d: `2024-01-${String(i + 1).padStart(2, "0")}`, close: i === 5 ? 5000 : 100 + i }));
    insertPrices(db, rows);
    insertPrices(db, [{ symbol: "MU", d: "2024-01-01", close: 999 }]); // duplicate PK → ignored
    const closes = loadCloses(db, "mu");
    expect(closes).toHaveLength(12); // dup ignored
    expect(closes[5]).toBeLessThan(200); // spike despiked on read
    expect(loadCloses(db, "mu", { despiked: false })[5]).toBe(5000); // raw preserved in store
  });

  it("saves digests and loads the latest", () => {
    const db = migratedDb();
    saveDigest(db, { d: "2026-07-01", dataJson: '{"headline":"day1"}' });
    const id2 = saveDigest(db, { d: "2026-07-02", dataJson: '{"headline":"day2"}', llmMd: "note" });
    const latest = loadLatestDigest(db);
    expect(latest?.id).toBe(id2);
    expect(latest?.d).toBe("2026-07-02");
    expect(latest?.llmMd).toBe("note");
  });

  it("persists RecCalls that the governor then reads to size a tier", () => {
    const db = migratedDb();
    // 5 resolved HIGH BUY calls, all favorable (outcome3m +10).
    for (let i = 0; i < 5; i++) saveRecCall(db, rc(`dsr${i}`));
    const proven = loadRecCallsForGovernor(db, { symbol: "MU" });
    expect(proven).toHaveLength(5);
    expect(governSize("HIGH", 10, proven).governed).toBe(10); // tier proven → lifted

    // Flip 3 to unfavorable → governor re-caps.
    updateRecCallOutcome(db, "dsr0", { outcome3mPct: -10 });
    updateRecCallOutcome(db, "dsr1", { outcome3mPct: -10 });
    updateRecCallOutcome(db, "dsr2", { outcome3mPct: -10 });
    const recheck = governSize("HIGH", 10, loadRecCallsForGovernor(db, { symbol: "MU" }));
    expect(recheck.governed).toBe(2); // 2/5 favorable < 50% → capped
    expect(recheck.reason).toMatch(/favorable only 40%/);
  });

  it("guards against lookahead leaks (no lookahead test)", () => {
    const db = migratedDb();
    insertPrices(db, [
      { symbol: "X", d: "2020-01-31", close: 100 },
      { symbol: "X", d: "2020-02-28", close: 105 },
      { symbol: "X", d: "2020-03-31", close: 110 },
    ]);

    const between = closesBetween(db, "2020-01-01", "2020-02-28");
    expect(between).toHaveLength(2);
    expect(between.map((b) => b.d)).toEqual(["2020-01-31", "2020-02-28"]);

    const upTo = symbolClosesUpTo(db, "X", "2020-02-28");
    expect(upTo).toHaveLength(2);
    expect(upTo.map((b) => b.d)).toEqual(["2020-01-31", "2020-02-28"]);
  });
});
