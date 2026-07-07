import { describe, it, expect } from "vitest";
import { computeAccruals, screenApplicability } from "./accruals";
import { FundamentalsQuarter } from "./types";

describe("accruals screen", () => {
  const createMockQuarters = (netIncome: number[], cfo: number[], assets: number[]): FundamentalsQuarter[] => {
    return netIncome.map((ni, i) => ({
      symbol: "TEST",
      periodEnd: `2020-0${i + 1}-31`,
      netIncome: ni,
      cfo: cfo[i],
      totalAssets: assets[i],
    }));
  };

  it("should check applicability", () => {
    expect(screenApplicability(["g_industrials"])).toEqual({ applicable: true });
    expect(screenApplicability(["g_financials"])).toEqual({
      applicable: false,
      reason: "Financials/REITs are excluded from this screen",
    });
  });

  it("should handle insufficient quarters", () => {
    const quarters = createMockQuarters([100], [80], [5000]); // 1 quarter
    const result = computeAccruals(quarters);
    expect(result.verdict).toBe("unknown");
    expect(result.value).toBeNull();
  });

  it("should pass when accruals < 0", () => {
    // TTM Net Income = 400, TTM CFO = 500. Diff = -100. Avg Assets = 5000. Ratio = -0.02
    const quarters = createMockQuarters(
      [100, 100, 100, 100],
      [125, 125, 125, 125],
      [5000, 5000, 5000, 5000]
    );
    const result = computeAccruals(quarters);
    expect(result.verdict).toBe("pass");
    expect(result.value).toBe(-0.02);
  });

  it("should warn when accruals between 0 and 0.10", () => {
    // TTM Net Income = 400, TTM CFO = 200. Diff = 200. Avg Assets = 5000. Ratio = 0.04
    const quarters = createMockQuarters(
      [100, 100, 100, 100],
      [50, 50, 50, 50],
      [5000, 5000, 5000, 5000]
    );
    const result = computeAccruals(quarters);
    expect(result.verdict).toBe("warn");
    expect(result.value).toBe(0.04);
  });

  it("should fail when accruals > 0.10", () => {
    // TTM Net Income = 400, TTM CFO = 0. Diff = 400. Avg Assets = 3000. Ratio = 0.133
    const quarters = createMockQuarters(
      [100, 100, 100, 100],
      [0, 0, 0, 0],
      [3000, 3000, 3000, 3000]
    );
    const result = computeAccruals(quarters);
    expect(result.verdict).toBe("fail");
    expect(result.value).toBeGreaterThan(0.10);
  });

  it("should handle null values gracefully", () => {
    const quarters = createMockQuarters(
      [100, 100, 100, 100],
      [50, 50, null as any, 50],
      [5000, 5000, 5000, 5000]
    );
    const result = computeAccruals(quarters);
    expect(result.verdict).toBe("unknown");
    expect(result.value).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
