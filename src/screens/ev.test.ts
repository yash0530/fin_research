import { describe, it, expect } from "vitest";
import { computeEvToEbit } from "./ev";
import type { FundamentalsQuarter } from "./types";

const q = (periodEnd: string, overrides: Partial<FundamentalsQuarter> = {}): FundamentalsQuarter => ({
  symbol: "TEST",
  periodEnd,
  operatingIncome: 100,
  totalDebt: 500,
  cash: 200,
  ...overrides,
});

const PERIODS = ["2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30"];

describe("computeEvToEbit", () => {
  it("computes EV/EBIT on a clean last-4 window", () => {
    const quarters = PERIODS.map((p) => q(p));
    const res = computeEvToEbit(quarters, 10_000);
    // EV = 10000 + 500 - 200 = 10300; TTM EBIT = 400
    expect(res.evToEbit).toBeCloseTo(10300 / 400, 6);
    expect(res.staleWindow).toBe(false);
    expect(res.warnings).toEqual([]);
  });

  it("falls back to older quarters when recent operatingIncome is missing, with a warning", () => {
    const quarters = [
      ...PERIODS.slice(0, 4).map((p) => q(p)),
      q("2025-03-31", { operatingIncome: null }),
      q("2025-06-30", { operatingIncome: null }),
    ];
    const res = computeEvToEbit(quarters, 10_000);
    expect(res.evToEbit).not.toBeNull();
    expect(res.staleWindow).toBe(true);
    expect(res.warnings.some((w) => w.includes("skips quarters"))).toBe(true);
  });

  it("refuses a window whose freshest usable quarter is stale beyond 540 days", () => {
    const quarters = [
      q("2022-03-31"), q("2022-06-30"), q("2022-09-30"), q("2022-12-31"),
      q("2025-03-31", { operatingIncome: null }),
      q("2025-06-30", { operatingIncome: null }),
    ];
    const res = computeEvToEbit(quarters, 10_000);
    expect(res.evToEbit).toBeNull();
    expect(res.staleWindow).toBe(true);
    expect(res.warnings.some((w) => w.includes("stale"))).toBe(true);
  });

  it("suspends the multiple on non-positive TTM EBIT", () => {
    const quarters = PERIODS.map((p) => q(p, { operatingIncome: -50 }));
    const res = computeEvToEbit(quarters, 10_000);
    expect(res.evToEbit).toBeNull();
    expect(res.warnings.some((w) => w.includes("suspended"))).toBe(true);
  });

  it("handles missing market cap and short histories", () => {
    expect(computeEvToEbit(PERIODS.map((p) => q(p)), null).evToEbit).toBeNull();
    expect(computeEvToEbit([q("2025-06-30")], 10_000).evToEbit).toBeNull();
  });

  it("sources debt/cash from the newest quarter that has them", () => {
    const quarters = [
      ...PERIODS.slice(0, 5).map((p) => q(p)),
      q("2025-06-30", { totalDebt: null, cash: null }),
    ];
    const res = computeEvToEbit(quarters, 10_000);
    // falls back to the 2025-03-31 balance sheet: EV = 10000 + 500 - 200
    expect(res.evToEbit).toBeCloseTo(10300 / 400, 6);
  });
});
