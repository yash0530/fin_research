import { describe, it, expect } from "vitest";
import { financialTrends, type Quarter } from "./financial-trends";

// 8 quarters oldest→newest; revenue +10/qtr, GM flat 40%, net 10%, fcf 15%.
const quarters: Quarter[] = [100, 110, 120, 130, 140, 150, 160, 170].map((rev, i) => ({
  periodEnd: `2024-0${i + 1}-01`,
  revenue: rev,
  grossProfit: rev * 0.4,
  netIncome: rev * 0.1,
  fcf: rev * 0.15,
}));

describe("financialTrends", () => {
  it("computes YoY, QoQ and margins", () => {
    const r = financialTrends(quarters);
    // latest 170 vs year-ago 130 => 30.769%
    expect(r.revenueYoYPct).toBeCloseTo(30.7692, 3);
    // 170 vs 160 => 6.25%
    expect(r.revenueQoQPct).toBeCloseTo(6.25, 4);
    expect(r.grossMarginLatest).toBeCloseTo(0.4, 6);
    expect(r.netMarginLatest).toBeCloseTo(0.1, 6);
    expect(r.fcfMarginLatest).toBeCloseTo(0.15, 6);
    expect(r.grossMarginYoYDeltaPP).toBeCloseTo(0, 6);
  });

  it("classifies decelerating revenue growth", () => {
    // latest YoY 30.77% < prior-quarter YoY 33.33% => decelerating
    expect(financialTrends(quarters).revenueTrend).toBe("decelerating");
  });

  it("reports insufficient with too few quarters", () => {
    const r = financialTrends(quarters.slice(0, 3));
    expect(r.revenueTrend).toBe("insufficient");
    expect(r.revenueYoYPct).toBeNull();
    expect(r.revenueQoQPct).not.toBeNull();
  });
});
