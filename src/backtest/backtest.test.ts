import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { forwardReturnPct, monthEnds, scoreSignal } from "./engine";
import { moversAsOf, drawdownFlagsAsOf, breadthAsOf } from "./families";
import { closesBetween, insertPrices, upsertTicker } from "../db/queries";
import { applyMigrations, type SqlDb } from "../db/migrate";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const INIT = readFileSync("prisma/migrations/0001_init.sql", "utf8");

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, [{ name: "0001_init", sql: INIT }]);
  return db;
}

describe("Backtest Engine Pure Calculations", () => {
  it("forwardReturnPct computes returns correctly with known series", () => {
    const closes = [
      { d: "2020-01-01", close: 100 },
      { d: "2020-01-02", close: 105 },
      { d: "2020-01-15", close: 110 },
      { d: "2020-01-31", close: 120 },
      { d: "2020-02-05", close: 130 },
    ];

    // From 2020-01-01 to 2020-01-31 (30 days) -> closest in series to target (2020-01-31) is 2020-01-31 (120)
    // Return: (120 - 100) / 100 = 20%
    const r1 = forwardReturnPct(closes, "2020-01-01", 30);
    expect(r1).toBeCloseTo(20);

    // From 2020-01-02 to 2020-02-01 (30 days) -> target date is 2020-02-01
    // The nearest-on-or-after date in series is 2020-02-05 (130).
    // Return from 2020-01-02 (105) to 2020-02-05 (130): (130 - 105) / 105 = 23.8095%
    const r2 = forwardReturnPct(closes, "2020-01-02", 30);
    expect(r2).toBeCloseTo(23.8095);
  });

  it("forwardReturnPct returns null if insufficient data", () => {
    const closes = [
      { d: "2020-01-01", close: 100 },
      { d: "2020-01-02", close: 105 },
    ];

    // Target is 2020-01-31, but latest bar in series is 2020-01-02 -> insufficient data
    const r = forwardReturnPct(closes, "2020-01-01", 30);
    expect(r).toBeNull();
  });

  it("monthEnds returns calendar month-ends correctly", () => {
    const grid = monthEnds("2020-01-15", "2020-04-15");
    expect(grid).toEqual(["2020-01-31", "2020-02-29", "2020-03-31"]);
  });

  it("scoreSignal computes metrics correctly", () => {
    const flagged = ["AAPL", "MSFT"];
    const baseline = ["AAPL", "MSFT", "GOOG", "AMZN"];
    const fwdReturns = new Map<string, number>([
      ["AAPL", 15],
      ["MSFT", 5],
      ["GOOG", -5],
      ["AMZN", 1],
    ]);

    // Baseline mean = (15 + 5 - 5 + 1) / 4 = 4%
    // Flagged mean = (15 + 5) / 2 = 10%
    // Excess = 6%
    // Beats baseline (4%): AAPL (15) beats, MSFT (5) beats -> 2 out of 2 beat -> hit rate = 1.0
    const res = scoreSignal(flagged, baseline, fwdReturns);
    expect(res.n).toBe(2);
    expect(res.flaggedMeanPct).toBe(10);
    expect(res.baselineMeanPct).toBe(4);
    expect(res.excessPct).toBe(6);
    expect(res.hitRate).toBe(1.0);
  });
});

describe("Lookahead Leak Tests", () => {
  it("ensures that signal extractors and db queries NEVER read data after asOf", () => {
    const db = migratedDb();
    const asOf = "2015-06-30";
    const futureDate = "2015-07-01"; // asOf + 1 day

    // Seed tickers
    upsertTicker(db, { symbol: "AAPL", watchlisted: true });
    upsertTicker(db, { symbol: "MSFT", watchlisted: true });
    db.prepare('UPDATE "Ticker" SET "active" = 1').run();

    // Insert prices up to asOf
    // AAPL: stable at 100
    // MSFT: stable at 100
    const historicalPrices = [];
    for (let day = 1; day <= 30; day++) {
      const dStr = `2015-06-${String(day).padStart(2, "0")}`;
      historicalPrices.push({ symbol: "AAPL", d: dStr, close: 100 });
      historicalPrices.push({ symbol: "MSFT", d: dStr, close: 100 });
    }
    insertPrices(db, historicalPrices);

    // Insert future prices (asOf + 1) that would change indicators if leaked:
    // 1. AAPL shoots up 50% on 2015-07-01 -> would make it a top up-mover if leaked
    // 2. MSFT drops 30% on 2015-07-01 -> would make it a drawdown flag (> 25% off high) if leaked
    // 3. Both being up/down would affect breadth if we use 50-bar MA looking forward
    const futurePrices = [
      { symbol: "AAPL", d: futureDate, close: 150 },
      { symbol: "MSFT", d: futureDate, close: 70 },
    ];
    insertPrices(db, futurePrices);

    // Verify closesBetween does not leak future date
    const cb = closesBetween(db, "2015-06-01", asOf);
    expect(cb.some((r) => r.d === futureDate)).toBe(false);

    // Verify moversAsOf (n=10) as of asOf
    // AAPL and MSFT returns up to asOf (2015-06-30) are 0% (since they remained at 100)
    // If future date leaked, AAPL would show +50% move
    const movers = moversAsOf(db, asOf, 10);
    expect(movers.up).not.toContain("AAPL");
    expect(movers.down).not.toContain("MSFT");

    // Verify drawdownFlagsAsOf as of asOf
    // High up to asOf is 100. Latest up to asOf is 100. Drawdown = 0%. Should not flag.
    // If future date leaked, MSFT latest would be 70 (drawdown = 30%), flagging it.
    const dd = drawdownFlagsAsOf(db, asOf, 25, 252);
    expect(dd).not.toContain("MSFT");

    // Verify breadthAsOf as of asOf
    // Up to asOf, both AAPL and MSFT have all closes at 100. 50-bar MA is 100.
    // Latest close is 100. So latest close is NOT > 50-bar MA. Breadth should be 0%.
    // If future date leaked, AAPL (150 > MA) would be above MA, changing breadth.
    const br = breadthAsOf(db, asOf);
    expect(br).toBe(0);
  });
});
