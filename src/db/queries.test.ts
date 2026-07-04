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
  upsertFundamentals,
  upsertPosition,
  deletePosition,
  listPositions,
  latestCloseFor,
  latestRecCallFor,
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

  it("upserts fundamentals overwriting on conflict", () => {
    const db = migratedDb();
    upsertFundamentals(db, [
      { symbol: "MU", periodEnd: "2024-08-31", revenue: 6800, grossProfit: 1800 },
    ]);
    upsertFundamentals(db, [
      { symbol: "MU", periodEnd: "2024-08-31", revenue: 7000, grossProfit: 2000, sga: 500 },
    ]);
    const row = db.prepare('SELECT "revenue", "grossProfit", "sga" FROM "FundamentalsQuarter" WHERE "symbol"=? AND "periodEnd"=?')
      .get("MU", "2024-08-31") as { revenue: number; grossProfit: number; sga: number };
    expect(row.revenue).toBe(7000);
    expect(row.grossProfit).toBe(2000);
    expect(row.sga).toBe(500);
  });

  it("performs position CRUD and latest close/reccall retrieval", () => {
    const db = migratedDb();
    
    // Test empty
    expect(listPositions(db)).toEqual([]);
    expect(latestCloseFor(db, "AAPL")).toBeNull();
    expect(latestRecCallFor(db, "AAPL")).toBeNull();

    // Test upsert AAPL
    upsertPosition(db, { symbol: "AAPL", qty: 10, avgCost: 150 });
    expect(listPositions(db)).toEqual([
      { symbol: "AAPL", qty: 10, avgCost: 150, openedAt: null }
    ]);

    // Test update
    upsertPosition(db, { symbol: "aapl", qty: 15, avgCost: 155, openedAt: "2026-07-03" });
    expect(listPositions(db)).toEqual([
      { symbol: "AAPL", qty: 15, avgCost: 155, openedAt: "2026-07-03" }
    ]);

    // Test multiple positions sorted by symbol
    upsertPosition(db, { symbol: "MSFT", qty: 5, avgCost: 300 });
    expect(listPositions(db)).toEqual([
      { symbol: "AAPL", qty: 15, avgCost: 155, openedAt: "2026-07-03" },
      { symbol: "MSFT", qty: 5, avgCost: 300, openedAt: null }
    ]);

    // Test latestCloseFor
    insertPrices(db, [
      { symbol: "AAPL", d: "2026-07-01", close: 160 },
      { symbol: "AAPL", d: "2026-07-02", close: 165 },
    ]);
    expect(latestCloseFor(db, "AAPL")).toBe(165);
    expect(latestCloseFor(db, "aapl")).toBe(165);

    // Test latestRecCallFor
    const call1 = rc("d1", { symbol: "AAPL", targetLow: 180, targetHigh: 200, stopPrice: 140, createdAt: 1000 });
    const call2 = rc("d2", { symbol: "AAPL", targetLow: 190, targetHigh: 210, stopPrice: 145, createdAt: 2000 });
    saveRecCall(db, call1);
    saveRecCall(db, call2);

    const latestCall = latestRecCallFor(db, "AAPL");
    expect(latestCall).not.toBeNull();
    expect(latestCall?.dossierId).toBe("d2");
    expect(latestCall?.createdAt).toBe(2000);
    expect(latestCall?.targetLow).toBe(190);
    expect(latestCall?.targetHigh).toBe(210);
    expect(latestCall?.stopPrice).toBe(145);

    // Test delete
    deletePosition(db, "AAPL");
    expect(listPositions(db)).toEqual([
      { symbol: "MSFT", qty: 5, avgCost: 300, openedAt: null }
    ]);
  });
});

