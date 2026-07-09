import { describe, it, expect } from "vitest";
import { computeReitQuality, screenApplicability } from "./reit-quality";
import { FundamentalsQuarter } from "./types";

describe("reit-quality screen", () => {
  const createMockQuarter = (periodEnd: string, overrides: Partial<FundamentalsQuarter> = {}): FundamentalsQuarter => ({
    symbol: "TESTREIT",
    periodEnd,
    revenue: 1000,
    grossProfit: 600,
    operatingIncome: 200,
    netIncome: 50, // FFO = 50 + 50 = 100 per quarter -> TTM FFO = 400
    fcf: 80,
    capex: 20,
    totalAssets: 5000,
    totalDebt: 1000,
    cash: 500,
    equity: 4000,
    sharesOut: 10, // TTM FFO/Share = 400/10 = 40
    cfo: 150,
    sga: 300,
    depreciation: 50,
    receivables: 200,
    currentAssets: 1500,
    currentLiabilities: 1000,
    retainedEarnings: 1000,
    ppe: 2000,
    ...overrides,
  });

  const createMockQuarters = (count: number, overridesList: Partial<FundamentalsQuarter>[] = []): FundamentalsQuarter[] => {
    const quarters: FundamentalsQuarter[] = [];
    for (let i = 0; i < count; i++) {
      const year = 2020 + Math.floor(i / 4);
      const q = (i % 4) + 1;
      const month = q === 1 ? "03" : q === 2 ? "06" : q === 3 ? "09" : "12";
      const overrides = overridesList[i] || {};
      quarters.push(createMockQuarter(`${year}-${month}-31`, overrides));
    }
    return quarters;
  };

  it("should pass applicability only for real estate", () => {
    expect(screenApplicability(["g_real_estate"])).toEqual({ applicable: true });
    expect(screenApplicability(["g_info_tech"])).toEqual({
      applicable: false,
      reason: "Applicable only to GICS Real Estate (g_real_estate)",
    });
  });

  it("should handle insufficient quarters", () => {
    const quarters = createMockQuarters(3);
    const result = computeReitQuality(quarters, 4000);
    expect(result.verdict).toBe("unknown");
    expect(result.ffoTtm).toBeNull();
    expect(result.warnings.some(w => w.includes("Insufficient quarters"))).toBe(true);
  });

  it("should classify P/FFO < 15 as cheap", () => {
    const quarters = createMockQuarters(4);
    // TTM FFO = 400. Market cap = 4000 -> P/FFO = 10 < 15 (cheap)
    const result = computeReitQuality(quarters, 4000);
    expect(result.ffoTtm).toBe(400);
    expect(result.ffoPerShare).toBe(40);
    expect(result.pFfo).toBe(10);
    expect(result.verdict).toBe("cheap");
    expect(result.warnings.some(w => w.includes("Dividend field is not available"))).toBe(true);
  });

  it("should classify P/FFO between 15 and 22 as fair", () => {
    const quarters = createMockQuarters(4);
    // TTM FFO = 400. Market cap = 7000 -> P/FFO = 17.5 (fair)
    const result = computeReitQuality(quarters, 7000);
    expect(result.pFfo).toBe(17.5);
    expect(result.verdict).toBe("fair");
  });

  it("should classify P/FFO > 22 as rich", () => {
    const quarters = createMockQuarters(4);
    // TTM FFO = 400. Market cap = 10000 -> P/FFO = 25 > 22 (rich)
    const result = computeReitQuality(quarters, 10000);
    expect(result.pFfo).toBe(25);
    expect(result.verdict).toBe("rich");
  });

  it("should suspend valuation on negative FFO", () => {
    const overrides: Partial<FundamentalsQuarter>[] = Array(4).fill({ netIncome: -100, depreciation: 20 });
    // TTM FFO = (-100 + 20) * 4 = -320 (negative)
    const quarters = createMockQuarters(4, overrides);
    const result = computeReitQuality(quarters, 4000);
    expect(result.ffoTtm).toBe(-320);
    expect(result.verdict).toBe("unknown");
    expect(result.pFfo).toBeNull();
    expect(result.warnings.some(w => w.includes("FFO is negative"))).toBe(true);
  });

  it("should handle missing marketCap gracefully", () => {
    const quarters = createMockQuarters(4);
    const result = computeReitQuality(quarters, null);
    expect(result.pFfo).toBeNull();
    expect(result.verdict).toBe("unknown");
    expect(result.warnings.some(w => w.includes("marketCap is missing"))).toBe(true);
  });

  it("should handle missing sharesOut gracefully", () => {
    const overrides: Partial<FundamentalsQuarter>[] = Array(4).fill({});
    overrides[3] = { sharesOut: null };
    const quarters = createMockQuarters(4, overrides);
    const result = computeReitQuality(quarters, 4000);
    expect(result.ffoPerShare).toBeNull();
    expect(result.warnings.some(w => w.includes("ffoPerShare: Latest quarter in the TTM window is missing sharesOut"))).toBe(true);
  });
});
