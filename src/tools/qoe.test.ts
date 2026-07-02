import { describe, it, expect } from "vitest";
import {
  accrualRatio,
  altmanZ,
  piotroskiF,
  beneishM,
  qoeReport,
  type AnnualPeriod,
} from "./qoe";

// Fixture with round numbers so every score is hand-verifiable.
const t: AnnualPeriod = {
  revenue: 1000, grossProfit: 400, sga: 200, depreciation: 50, ebit: 150, netIncome: 100,
  receivables: 100, currentAssets: 500, ppe: 300, totalAssets: 1000, currentLiabilities: 200,
  longTermDebt: 100, totalLiabilities: 400, retainedEarnings: 250, sharesOut: 100, cfo: 120,
  workingCapital: 300, sbc: 30, marketValueEquity: 1500,
};
const p: AnnualPeriod = {
  revenue: 900, grossProfit: 360, sga: 180, depreciation: 45, ebit: 130, netIncome: 80,
  receivables: 80, currentAssets: 450, ppe: 280, totalAssets: 950, currentLiabilities: 210,
  longTermDebt: 120, totalLiabilities: 420, retainedEarnings: 180, sharesOut: 100, cfo: 95,
  workingCapital: 240, sbc: 25,
};

describe("QoE forensics (golden, hand-derived)", () => {
  it("accrual ratio = (NI − CFO)/TA", () => {
    // (100 − 120)/1000 = −0.02  (negative = conservative)
    expect(accrualRatio(t)).toBeCloseTo(-0.02, 6);
  });

  it("Altman Z (public-manufacturing) = 4.455", () => {
    // 1.2(.3)+1.4(.25)+3.3(.15)+0.6(3.75)+1.0(1.0) = .36+.35+.495+2.25+1.0
    expect(altmanZ(t)).toBeCloseTo(4.455, 3);
  });

  it("Piotroski F = 8 (all but the flat gross margin)", () => {
    expect(piotroskiF(t, p)).toBe(8);
  });

  it("Beneish M = −2.3735", () => {
    expect(beneishM(t, p)).toBeCloseTo(-2.3735, 3);
  });

  it("assembles a report with zones, flags, and SBC%", () => {
    const r = qoeReport(t, p);
    expect(r.altmanZone).toBe("safe"); // 4.455 > 2.99
    expect(r.beneishFlag).toBe("unlikely_manipulator"); // −2.37 < −1.78
    expect(r.piotroskiF).toBe(8);
    expect(r.sbcPctRevenue).toBeCloseTo(0.03, 6); // 30/1000
    expect(r.flags).toEqual([]); // clean company
  });

  it("flags a distressed, manipulative profile", () => {
    const bad: AnnualPeriod = {
      ...t,
      netIncome: 300, cfo: 50, // huge positive accruals
      retainedEarnings: -200, ebit: -50, // distress
      receivables: 400, // receivables ballooning vs sales
      marketValueEquity: 100,
    };
    const r = qoeReport(bad, p);
    expect(r.altmanZone).toBe("distress");
    expect(r.flags.length).toBeGreaterThan(0);
  });
});
