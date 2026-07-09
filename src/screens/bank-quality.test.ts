import { describe, it, expect } from "vitest";
import { computeBankQuality, screenApplicability } from "./bank-quality";
import { FundamentalsQuarter } from "./types";

describe("bank-quality screen", () => {
  const createMockQuarter = (periodEnd: string, overrides: Partial<FundamentalsQuarter> = {}): FundamentalsQuarter => ({
    symbol: "TESTBANK",
    periodEnd,
    revenue: 1000,
    grossProfit: 600,
    operatingIncome: 200,
    netIncome: 15, // TTM NI = 60, TTM Assets = 1000 -> ROA = 6.0% (pass)
    fcf: 80,
    capex: 20,
    totalAssets: 1000, // TTM Assets = 4000
    totalDebt: 100,
    cash: 50,
    equity: 120, // TTM Equity = 480 -> avg equity = 120. ROE = 60/120 = 50.0% (pass). Capital ratio = 120/1000 = 12% (pass)
    sharesOut: 10,
    cfo: 15,
    sga: 120, // TTM SGA = 480, TTM Rev = 4000 -> SGA/Rev = 12% (pass)
    depreciation: 5,
    receivables: 20,
    currentAssets: 150,
    currentLiabilities: 100,
    retainedEarnings: 100,
    ppe: 200,
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

  it("should pass applicability only for financials", () => {
    expect(screenApplicability(["g_financials"])).toEqual({ applicable: true });
    expect(screenApplicability(["g_info_tech"])).toEqual({
      applicable: false,
      reason: "Applicable only to GICS Financials (g_financials)",
    });
  });

  it("should handle insufficient quarters", () => {
    const quarters = createMockQuarters(3);
    const result = computeBankQuality(quarters);
    expect(result.score).toBe(0);
    expect(result.maxComputable).toBe(0);
    expect(result.warnings.some(w => w.includes("Insufficient quarters"))).toBe(true);
    expect(result.tests.every(t => t.result === "unknown")).toBe(true);
  });

  it("should calculate correct score for happy path (all passes)", () => {
    const quarters = createMockQuarters(4);
    const result = computeBankQuality(quarters);

    expect(result.warnings).toHaveLength(1); // just the header warning
    expect(result.warnings[0]).toContain("not a true NIM/credit-quality model");
    expect(result.maxComputable).toBe(4);
    expect(result.score).toBe(4);
    
    expect(result.roa).toBeCloseTo(0.06);
    expect(result.roe).toBeCloseTo(0.50);
    expect(result.capitalRatio).toBeCloseTo(0.12);
    expect(result.efficiency).toBeCloseTo(0.12);

    expect(result.tests.find(t => t.name === "roa")?.result).toBe("pass");
    expect(result.tests.find(t => t.name === "roe")?.result).toBe("pass");
    expect(result.tests.find(t => t.name === "capitalRatio")?.result).toBe("pass");
    expect(result.tests.find(t => t.name === "efficiency")?.result).toBe("pass");
  });

  it("should fail tests below threshold", () => {
    // Modify values so they fail
    // ROA: netIncome = 2 (TTM NI = 8 / 1000 = 0.8% -> fail)
    // ROE: equity = 200 for index 0,1,2, and 50 for index 3 (avg equity = 162.5 -> ROE = 8 / 162.5 = 4.9% -> fail)
    // Capital ratio: latest equity = 50, assets = 1000 -> 5% -> fail
    // Efficiency: sga = 700 -> TTM SGA = 2800 / 4000 = 70% -> fail
    const overrides: Partial<FundamentalsQuarter>[] = Array(4).fill(null).map((_, i) => ({
      netIncome: 2,
      equity: i === 3 ? 50 : 200,
      sga: 700,
    }));

    const quarters = createMockQuarters(4, overrides);
    const result = computeBankQuality(quarters);

    expect(result.maxComputable).toBe(4);
    expect(result.score).toBe(0); // all fail

    expect(result.tests.find(t => t.name === "roa")?.result).toBe("fail");
    expect(result.tests.find(t => t.name === "roe")?.result).toBe("fail");
    expect(result.tests.find(t => t.name === "capitalRatio")?.result).toBe("fail");
    expect(result.tests.find(t => t.name === "efficiency")?.result).toBe("fail");
  });

  it("marks individual tests unknown when parameters are missing", () => {
    const overrides: Partial<FundamentalsQuarter>[] = Array(4).fill({});
    // Let's make latest quarter miss equity (impacts roe & capitalRatio)
    overrides[3] = { equity: null };
    // Let's make first quarter miss sga (impacts efficiency)
    overrides[0] = { sga: null };

    const quarters = createMockQuarters(4, overrides);
    const result = computeBankQuality(quarters);

    expect(result.tests.find(t => t.name === "roa")?.result).toBe("pass");
    expect(result.tests.find(t => t.name === "roe")?.result).toBe("unknown");
    expect(result.tests.find(t => t.name === "capitalRatio")?.result).toBe("unknown");
    expect(result.tests.find(t => t.name === "efficiency")?.result).toBe("unknown");

    expect(result.maxComputable).toBe(1);
    expect(result.score).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(1);
  });
});
