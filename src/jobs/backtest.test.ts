import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { SqlDb } from "../db/migrate";
import { applyMigrations } from "../db/migrate";
import { upsertTicker, insertPrices } from "../db/queries";
import { runBacktestJob } from "./backtest";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

const ALL = readdirSync("prisma/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((name) => ({ name: name.replace(/\.sql$/, ""), sql: readFileSync(join("prisma/migrations", name), "utf8") }));

function db(): SqlDb {
  const d = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(d, ALL);
  return d;
}

describe("runBacktestJob", () => {
  it("computes backtest over tiny grid with known signal", async () => {
    const d = db();
    upsertTicker(d, { symbol: "TICK1", name: "Ticker 1" });
    upsertTicker(d, { symbol: "TICK2", name: "Ticker 2" });

    // Seed prices
    insertPrices(d, [
      { symbol: "TICK1", d: "2010-01-28", close: 100 },
      { symbol: "TICK1", d: "2010-01-29", close: 110 }, // 10% gain, top mover
      { symbol: "TICK1", d: "2010-02-19", close: 132 }, // +20% fwd return (21d)

      { symbol: "TICK2", d: "2010-01-28", close: 10 },
      { symbol: "TICK2", d: "2010-01-29", close: 10 }, // flat
      { symbol: "TICK2", d: "2010-02-19", close: 10 }, // flat fwd return
    ]);

    // Run backtest over the single month grid
    const tableStr = await runBacktestJob(d, {
      startISO: "2010-01-01",
      endISO: "2010-01-31",
      horizons: [{ label: "21d", days: 21 }],
    });

    expect(tableStr).toContain("Deterministic Signal Backtest Run Results:");
    expect(tableStr).toContain("movers_up");
    expect(tableStr).toContain("movers_down");
    expect(tableStr).toContain("drawdown");
  });
});
