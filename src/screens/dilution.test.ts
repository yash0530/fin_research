import { describe, it, expect } from "vitest";
import { computeDilution, screenApplicability } from "./dilution";
import { FundamentalsQuarter } from "./types";

describe("dilution screen", () => {
  const createMockQuarters = (shares: (number | null)[]): FundamentalsQuarter[] => {
    return shares.map((s, i) => ({
      symbol: "TEST",
      periodEnd: `2020-${String(i + 1).padStart(2, "0")}-31`,
      sharesOut: s,
    }));
  };

  it("should check applicability", () => {
    expect(screenApplicability(["g_comm_services"])).toEqual({ applicable: true });
    expect(screenApplicability(["g_real_estate"])).toEqual({
      applicable: false,
      reason: "Financials/REITs are excluded from this screen",
    });
  });

  it("should handle insufficient quarters", () => {
    const quarters = createMockQuarters(Array(12).fill(100)); // 12 quarters, needs 13
    const result = computeDilution(quarters);
    expect(result.verdict).toBe("unknown");
    expect(result.value).toBeNull();
  });

  it("should pass when shares decrease or stay same", () => {
    // 13 quarters: q0 = 100 shares, q12 = 98 shares. change = -2%
    const shares = [100, ...Array(11).fill(99), 98];
    const quarters = createMockQuarters(shares);
    const result = computeDilution(quarters);
    expect(result.verdict).toBe("pass");
    expect(result.value).toBe(-2);
  });

  it("should fail when shares increase", () => {
    // 13 quarters: q0 = 100 shares, q12 = 105 shares. change = +5%
    const shares = [100, ...Array(11).fill(102), 105];
    const quarters = createMockQuarters(shares);
    const result = computeDilution(quarters);
    expect(result.verdict).toBe("fail");
    expect(result.value).toBe(5);
  });

  it("should handle null and invalid inputs", () => {
    const shares = [100, ...Array(11).fill(102), null];
    const quarters = createMockQuarters(shares);
    const result = computeDilution(quarters);
    expect(result.verdict).toBe("unknown");
    expect(result.value).toBeNull();
  });
});
