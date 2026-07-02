import { describe, it, expect } from "vitest";
import { percentileRank, rankUniverse } from "./relative-rank";
import { sectorHeat } from "./sector-heat";

describe("relative-rank", () => {
  it("percentileRank = % of universe at or below the value", () => {
    expect(percentileRank([10, 20, 30, 40], 30)).toBe(75); // 3 of 4
    expect(percentileRank([], 5)).toBe(0);
  });

  it("tags leaders (top decile) and laggards (bottom decile), sorted desc", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ symbol: `s${i + 1}`, metric: i + 1 }));
    const ranked = rankUniverse(entries);
    expect(ranked[0].symbol).toBe("s10");
    expect(ranked[0].tag).toBe("leader"); // percentile 100 >= 90
    expect(ranked[ranked.length - 1].tag).toBe("laggard"); // percentile 10 <= 10
  });
});

describe("sector-heat", () => {
  it("aggregates per-sector mean/median return and sorts hottest first", () => {
    const heat = sectorHeat([
      { symbol: "A1", sectorCode: "A", retPct: 10 },
      { symbol: "A2", sectorCode: "A", retPct: 20 },
      { symbol: "B1", sectorCode: "B", retPct: -5 },
      { symbol: "B2", sectorCode: "B", retPct: -15 },
    ]);
    expect(heat[0].sectorCode).toBe("A");
    expect(heat[0].meanRetPct).toBeCloseTo(15);
    expect(heat[0].medianRetPct).toBeCloseTo(15);
    expect(heat[1].sectorCode).toBe("B");
    expect(heat[1].meanRetPct).toBeCloseTo(-10);
    expect(heat[1].count).toBe(2);
  });
});
