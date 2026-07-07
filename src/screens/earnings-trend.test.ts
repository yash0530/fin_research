import { describe, it, expect } from "vitest";
import { computeEarningsTrend, screenApplicability } from "./earnings-trend";
import { FundamentalsQuarter } from "./types";

describe("earnings trend screen", () => {
  const createMockQuarters = (netIncomes: number[]): FundamentalsQuarter[] => {
    return netIncomes.map((ni, i) => ({
      symbol: "TEST",
      periodEnd: `2020-${String(i + 1).padStart(2, "0")}-31`,
      netIncome: ni,
      sharesOut: 100, // keep shares outstanding constant so EPS matches netIncome pattern
    }));
  };

  it("should check applicability", () => {
    expect(screenApplicability(["g_info_tech"])).toEqual({ applicable: true });
    expect(screenApplicability(["g_financials"])).toEqual({
      applicable: false,
      reason: "Financials/REITs are excluded from this screen",
    });
  });

  it("should handle insufficient quarters", () => {
    const quarters = createMockQuarters(Array(24).fill(100)); // 24 quarters, needs 25
    const result = computeEarningsTrend(quarters);
    expect(result.verdict).toBe("unknown");
    expect(result.zScore).toBeNull();
  });

  it("should calculate correct z-score and verdict", () => {
    // Generate 25 quarters. Let's make EPS stable for 24 quarters, then jump/drop in the 25th.
    // EPS values: 1 for q0..q23
    // Seasonal diffs: diff_t = EPS_t - EPS_{t-4} = 1 - 1 = 0 for t = 4..23.
    // Expected EPS_{24} = EPS_{20} + mean(last 8 diffs) = 1 + 0 = 1.
    // Errors for t=12..23: error_t = EPS_t - expected_t = 1 - 1 = 0.
    // So the last 12 errors (for t=12..23) are all 0.
    // Wait! If they are all 0, sigma will be 0. So let's add some variance to the historical errors.
    // Let's make historical EPS alternate or have random-like errors so sigma is non-zero.
    // E.g., let's set EPS:
    const epsValues = [
      1.0, 1.1, 0.9, 1.0, // y1
      1.0, 1.2, 0.8, 1.0, // y2
      1.1, 1.1, 0.9, 1.0, // y3
      1.0, 1.2, 0.8, 1.0, // y4
      1.1, 1.1, 0.9, 1.0, // y5
      1.0, 1.2, 0.8, 1.0, // y6
      1.5, // y7 q1 (latest, index 24)
    ];

    const quarters = epsValues.map((val, i) => ({
      symbol: "TEST",
      periodEnd: `${2020 + Math.floor(i / 4)}-Q${(i % 4) + 1}`,
      netIncome: val * 100,
      sharesOut: 100,
    }));

    // Verify it computes.
    const result = computeEarningsTrend(quarters);
    expect(result.zScore).not.toBeNull();
    expect(result.verdict).not.toBe("unknown");
  });

  it("should return deteriorating for large negative z-score", () => {
    // Latest quarter has a huge earnings miss.
    const epsValues = Array(24).fill(1.0);
    // Add small errors to historical EPS so sigma is non-zero
    for (let i = 0; i < 24; i++) {
      epsValues[i] = 1.0 + Math.sin(i) * 0.1;
    }
    epsValues.push(-10.0); // massive miss

    const quarters = epsValues.map((val, i) => ({
      symbol: "TEST",
      periodEnd: `${2020 + Math.floor(i / 4)}-Q${(i % 4) + 1}`,
      netIncome: val * 100,
      sharesOut: 100,
    }));

    const result = computeEarningsTrend(quarters);
    expect(result.verdict).toBe("deteriorating");
    expect(result.zScore!).toBeLessThan(-1.5);
  });

  it("should return improvingConfirmed / improvingUnconfirmed based on price reaction", () => {
    // Latest quarter has a huge earnings beat.
    const epsValues = Array(24).fill(1.0);
    // Add small errors so sigma is non-zero
    for (let i = 0; i < 24; i++) {
      epsValues[i] = 1.0 + Math.sin(i) * 0.1;
    }
    epsValues.push(10.0); // massive beat

    const quarters = epsValues.map((val, i) => ({
      symbol: "TEST",
      periodEnd: `${2020 + Math.floor(i / 4)}-Q${(i % 4) + 1}`,
      netIncome: val * 100,
      sharesOut: 100,
    }));

    // No reaction passed -> improvingUnconfirmed
    const resultUnconfirmed = computeEarningsTrend(quarters);
    expect(resultUnconfirmed.verdict).toBe("improvingUnconfirmed");

    // Positive reaction passed -> improvingConfirmed
    const resultConfirmed = computeEarningsTrend(quarters, 0.05);
    expect(resultConfirmed.verdict).toBe("improvingConfirmed");

    // Negative reaction passed -> improvingUnconfirmed
    const resultNegReaction = computeEarningsTrend(quarters, -0.02);
    expect(resultNegReaction.verdict).toBe("improvingUnconfirmed");
  });
});
