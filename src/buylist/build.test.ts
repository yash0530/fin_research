import { describe, it, expect } from "vitest";
import { buildBuyList, type Candidate } from "./build";

const cand = (over: Partial<Candidate>): Candidate => ({
  symbol: "X",
  dossierId: "d",
  action: "BUY",
  conviction: "MEDIUM",
  judgeSizePct: 5,
  governedSizePct: 5,
  governorReason: "",
  ageDays: 1,
  ...over,
});

describe("buildBuyList", () => {
  const opts = { capitalUsd: 2500, minLotUsd: 100, maxAgeDays: 45 };

  it("ranks by conviction, sizes by min(judge,governed), skips sub-lot, residual → cash", () => {
    const list = buildBuyList(
      [
        cand({ symbol: "A", conviction: "HIGH", judgeSizePct: 12, governedSizePct: 12, ageDays: 10 }),
        cand({ symbol: "B", conviction: "MEDIUM", judgeSizePct: 8, governedSizePct: 8, ageDays: 20 }),
        cand({ symbol: "C", conviction: "LOW", judgeSizePct: 10, governedSizePct: 2, ageDays: 5 }), // capped → 2% = $50 < lot
        cand({ symbol: "D", action: "HOLD" }), // not BUY
        cand({ symbol: "E", conviction: "HIGH", judgeSizePct: 10, governedSizePct: 10, ageDays: 60 }), // stale
      ],
      opts,
    );
    expect(list.items.map((i) => i.symbol)).toEqual(["A", "B", "C"]); // D/E excluded, ranked HIGH→LOW
    expect(list.items[0]).toMatchObject({ symbol: "A", plannedUsd: 300, effectiveSizePct: 12 });
    expect(list.items[1]).toMatchObject({ symbol: "B", plannedUsd: 200 });
    expect(list.items[2]).toMatchObject({ symbol: "C", plannedUsd: 0, skipped: true }); // $50 < $100 lot
    expect(list.deployedUsd).toBe(500);
    expect(list.cashUsd).toBe(2000);
  });

  it("scales proportionally when sizes exceed 100% of capital", () => {
    const list = buildBuyList(
      [
        cand({ symbol: "A", conviction: "HIGH", judgeSizePct: 80, governedSizePct: 80 }),
        cand({ symbol: "B", conviction: "HIGH", judgeSizePct: 80, governedSizePct: 80 }),
      ],
      opts,
    );
    // 160% total → scaled to 100%; each ~50% → $1250.
    expect(list.deployedUsd).toBeLessThanOrEqual(2500);
    expect(list.items[0].plannedUsd).toBeGreaterThan(1000);
  });
});
