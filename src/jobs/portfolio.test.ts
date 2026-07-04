import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { SqlDb } from "../db/migrate";
import { applyMigrations } from "../db/migrate";
import { upsertPosition, insertPrices, saveRecCall } from "../db/queries";
import { runPortfolioCheck } from "./portfolio";
import type { RecCall } from "../dossier/state";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

const ALL_MIGRATIONS = readdirSync("prisma/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((name) => ({
    name: name.replace(/\.sql$/, ""),
    sql: readFileSync(join("prisma/migrations", name), "utf8"),
  }));

function db(): SqlDb {
  const d = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(d, ALL_MIGRATIONS);
  return d;
}

const mockRecCall = (overrides: Partial<RecCall> = {}): RecCall => ({
  dossierId: "test-dossier",
  symbol: "XYZ",
  action: "BUY",
  conviction: "HIGH",
  priceAtCall: 100,
  targetLow: 120,
  targetHigh: 150,
  stopPrice: 80,
  judgeSizePct: 5,
  governedSizePct: 5,
  governorReason: "",
  model: "test-model",
  thinkingMode: false,
  promptVersion: "v1",
  createdAt: Date.now(),
  outcome1mPct: null,
  outcome3mPct: null,
  outcome6mPct: null,
  outcome1yPct: null,
  thesisFalsified: null,
  ...overrides,
});

describe("runPortfolioCheck job", () => {
  it("returns 0 positions when empty", async () => {
    const d = db();
    const result = await runPortfolioCheck(d);
    expect(result).toBe("0 positions");
  });

  it("surfaces a stop breach and drawdown correctly", async () => {
    const d = db();

    // 1. Position AAPL (normal)
    upsertPosition(d, { symbol: "AAPL", qty: 10, avgCost: 150 });
    insertPrices(d, [{ symbol: "AAPL", d: "2026-07-02", close: 160 }]);
    saveRecCall(d, mockRecCall({ dossierId: "d-aapl", symbol: "AAPL", stopPrice: 140, action: "BUY" }));

    // 2. Position MU (breaching stop)
    upsertPosition(d, { symbol: "MU", qty: 15, avgCost: 850 });
    insertPrices(d, [{ symbol: "MU", d: "2026-07-02", close: 835 }]);
    saveRecCall(d, mockRecCall({ dossierId: "d-mu", symbol: "MU", stopPrice: 840, action: "BUY" }));

    // 3. Position NVDA (in drawdown)
    upsertPosition(d, { symbol: "NVDA", qty: 5, avgCost: 100 });
    insertPrices(d, [
      { symbol: "NVDA", d: "2026-06-01", close: 130 },
      { symbol: "NVDA", d: "2026-06-02", close: 95 }, // drawdown from 130 is ((95-130)/130) = -26.92% <= -25%
    ]);

    const result = await runPortfolioCheck(d);
    expect(result).toContain("3 positions");
    expect(result).toContain("⚠ MU stop_breach @ 835");
    expect(result).toContain("NVDA drawdown -26.92%");
  });
});
