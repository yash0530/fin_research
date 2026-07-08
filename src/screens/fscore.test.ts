import { describe, it, expect } from "vitest";
import { computeFScore, screenApplicability } from "./fscore";
import { FundamentalsQuarter } from "./types";

describe("fscore screen", () => {
  const createMockQuarter = (periodEnd: string, overrides: Partial<FundamentalsQuarter> = {}): FundamentalsQuarter => ({
    symbol: "TEST",
    periodEnd,
    revenue: 1000,
    grossProfit: 600,
    operatingIncome: 200,
    netIncome: 100,
    fcf: 80,
    capex: 20,
    totalAssets: 5000,
    totalDebt: 1000,
    cash: 500,
    equity: 4000,
    sharesOut: 100,
    cfo: 150, // cfo > netIncome (accrual pass)
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

  it("should pass applicability for non-financials/REITs", () => {
    expect(screenApplicability(["g_info_tech"])).toEqual({ applicable: true });
    expect(screenApplicability(["g_financials"])).toEqual({
      applicable: false,
      reason: "Financials/REITs are excluded from this screen",
    });
    expect(screenApplicability(["g_real_estate"])).toEqual({
      applicable: false,
      reason: "Financials/REITs are excluded from this screen",
    });
  });

  it("should handle insufficient quarters", () => {
    const quarters = createMockQuarters(3);
    const result = computeFScore(quarters);
    expect(result.score).toBe(0);
    expect(result.maxComputable).toBe(0);
    expect(result.warnings.some(w => w.includes("Insufficient quarters"))).toBe(true);
    expect(result.tests.every(t => t.result === "unknown")).toBe(true);
  });

  it("should calculate correct score for happy path", () => {
    // 8 quarters where TTM is better than prior TTM
    const overrides: Partial<FundamentalsQuarter>[] = Array(8).fill({});
    // Let's make prior TTM (first 4 quarters, index 0 to 3) have worse metrics:
    // e.g. prior TTM ROA: netIncome = 50, assets = 5000 -> ROA = 0.01
    // current TTM ROA: netIncome = 150, assets = 5000 -> ROA = 0.03
    for (let i = 0; i < 4; i++) {
      overrides[i] = {
        netIncome: 50,
        cfo: 40,
        totalDebt: 2000,
        currentAssets: 1200,
        sharesOut: 110,
        grossProfit: 500,
        revenue: 1000,
      };
    }
    const quarters = createMockQuarters(8, overrides);
    const result = computeFScore(quarters);

    expect(result.warnings).toHaveLength(0);
    expect(result.maxComputable).toBe(9);
    // Let's check results:
    // roa: T_NI (400) > 0 -> pass
    // cfo: T_CFO (600) > 0 -> pass
    // roa_trend: current (400/5000 = 0.08) > prior (200/5000 = 0.04) -> pass
    // accrual: T_CFO (600) > T_NI (400) -> pass
    // leverage: T_Debt/Assets (1000/5000 = 0.2) < prior (2000/5000 = 0.4) -> pass
    // liquidity: T_Ratio (1500/1000 = 1.5) > prior (1200/1000 = 1.2) -> pass
    // dilution: T_Shares (100) <= prior (110) -> pass
    // gross_margin: T_GM (2400/4000 = 0.6) > prior (2000/4000 = 0.5) -> pass
    // asset_turnover: T_ATO (4000/5000 = 0.8) > prior (4000/5000 = 0.8) -> fail (not greater)
    expect(result.score).toBe(8);
  });

  it("tolerates an un-filed cash-flow in the newest quarter by using the freshest complete quarters", () => {
    // 9 quarters, newest lacks cfo (10-Q cash flow not yet filed). The freshest
    // 8 CFO-reporting quarters still form the TTM/prior windows → score computes,
    // rather than the whole screen collapsing to unknown.
    const overrides: Partial<FundamentalsQuarter>[] = Array(9).fill({});
    overrides[8] = { cfo: null };
    const quarters = createMockQuarters(9, overrides);
    const result = computeFScore(quarters);

    const roaTest = result.tests.find((t) => t.name === "roa");
    expect(roaTest?.result).not.toBe("unknown");
    expect(result.maxComputable).toBeGreaterThanOrEqual(8);
  });

  it("marks a per-test metric unknown when it is missing across the window, without failing the whole score", () => {
    // grossProfit null in a window quarter → only gross_margin is unknown.
    const overrides: Partial<FundamentalsQuarter>[] = Array(8).fill({});
    overrides[7] = { grossProfit: null };
    const quarters = createMockQuarters(8, overrides);
    const result = computeFScore(quarters);

    expect(result.warnings.length).toBeGreaterThan(0);
    const gm = result.tests.find((t) => t.name === "gross_margin");
    expect(gm?.result).toBe("unknown");
    expect(result.maxComputable).toBeLessThan(9);
  });

  it("is unknown when fewer than 4 quarters report Net Income + CFO", () => {
    const overrides: Partial<FundamentalsQuarter>[] = Array(8).fill({});
    // Only 3 quarters carry cfo → cannot form a TTM window.
    for (let i = 0; i < 5; i++) overrides[i] = { cfo: null };
    const quarters = createMockQuarters(8, overrides);
    const result = computeFScore(quarters);
    expect(result.warnings.some((w) => w.includes("Insufficient quarters reporting"))).toBe(true);
  });
});
