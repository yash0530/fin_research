import { describe, it, expect } from "vitest";
import { computeCohortCheapness, screenApplicability } from "./cohort";

describe("cohort cheapness screen", () => {
  it("should check applicability", () => {
    expect(screenApplicability(["g_energy"])).toEqual({ applicable: true });
    expect(screenApplicability(["g_financials"])).toEqual({
      applicable: false,
      reason: "Financials/REITs are excluded from this screen",
    });
  });

  it("should warn if sector has <10 names", () => {
    const rows = [
      { symbol: "A", sectorCode: "g_tech", evToEbit: 10 },
      { symbol: "B", sectorCode: "g_tech", evToEbit: 12 },
    ];
    const result = computeCohortCheapness(rows);
    expect(result.warnings.some(w => w.includes("has <10 names"))).toBe(true);
  });

  it("should select the bottom 25% of names in each sector", () => {
    // 8 names in g_tech: bottom 25% is Math.floor(8 * 0.25) = 2 names.
    // values: 5, 10, 15, 20, 25, 30, 35, 40. Bottom 2: A (5) and B (10)
    const rows = [
      { symbol: "H", sectorCode: "g_tech", evToEbit: 40 },
      { symbol: "G", sectorCode: "g_tech", evToEbit: 35 },
      { symbol: "F", sectorCode: "g_tech", evToEbit: 30 },
      { symbol: "E", sectorCode: "g_tech", evToEbit: 25 },
      { symbol: "D", sectorCode: "g_tech", evToEbit: 20 },
      { symbol: "C", sectorCode: "g_tech", evToEbit: 15 },
      { symbol: "B", sectorCode: "g_tech", evToEbit: 10 },
      { symbol: "A", sectorCode: "g_tech", evToEbit: 5 },
    ];

    const result = computeCohortCheapness(rows);
    expect(result.cheap.has("A")).toBe(true);
    expect(result.cheap.has("B")).toBe(true);
    expect(result.cheap.has("C")).toBe(false);
    expect(result.cheap.size).toBe(2);
  });

  it("should sort alphabetically to break ties deterministically", () => {
    // 4 names in g_tech, EV/EBIT is all 10. Bottom 25% of 4 = 1 name.
    // Alphabetically, A is first.
    const rows = [
      { symbol: "D", sectorCode: "g_tech", evToEbit: 10 },
      { symbol: "C", sectorCode: "g_tech", evToEbit: 10 },
      { symbol: "B", sectorCode: "g_tech", evToEbit: 10 },
      { symbol: "A", sectorCode: "g_tech", evToEbit: 10 },
    ];

    const result = computeCohortCheapness(rows);
    expect(result.cheap.has("A")).toBe(true);
    expect(result.cheap.has("B")).toBe(false);
    expect(result.cheap.size).toBe(1);
  });
});
