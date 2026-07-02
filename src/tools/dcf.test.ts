import { describe, it, expect } from "vitest";
import { dcfScenario, dcfThreeScenario, upsidePct, type DcfInputs } from "./dcf";

describe("dcfScenario", () => {
  it("matches a hand-computed closed-form case", () => {
    // baseFcf=100, 1yr, g=0, tg=0, r=10%, 10 shares, no net debt.
    // PV(explicit) = 100/1.1 = 90.909…; TV = 100/0.10 = 1000; PV(TV)=1000/1.1=909.09…
    // EV = 1000, equity = 1000, per share = 100.
    const inputs: DcfInputs = { baseFcf: 100, sharesOut: 10, netDebt: 0 };
    const r = dcfScenario(inputs, { growthRate: 0, years: 1, terminalGrowth: 0, discountRate: 0.1 });
    expect(r.enterpriseValue).toBeCloseTo(1000, 6);
    expect(r.equityValue).toBeCloseTo(1000, 6);
    expect(r.fairValuePerShare).toBeCloseTo(100, 6);
  });

  it("subtracts net debt from enterprise value", () => {
    const r = dcfScenario(
      { baseFcf: 100, sharesOut: 10, netDebt: 200 },
      { growthRate: 0, years: 1, terminalGrowth: 0, discountRate: 0.1 },
    );
    expect(r.equityValue).toBeCloseTo(800, 6);
    expect(r.fairValuePerShare).toBeCloseTo(80, 6);
  });

  it("throws when discountRate <= terminalGrowth", () => {
    expect(() =>
      dcfScenario({ baseFcf: 100, sharesOut: 10, netDebt: 0 }, {
        growthRate: 0,
        years: 5,
        terminalGrowth: 0.1,
        discountRate: 0.1,
      }),
    ).toThrow(/must exceed/);
  });
});

describe("dcfThreeScenario", () => {
  it("is monotonic in growth (bull > base > bear)", () => {
    const inputs: DcfInputs = { baseFcf: 100, sharesOut: 10, netDebt: 0 };
    const common = { years: 5, terminalGrowth: 0.02, discountRate: 0.1 };
    const r = dcfThreeScenario(inputs, {
      bear: { ...common, growthRate: 0.0 },
      base: { ...common, growthRate: 0.05 },
      bull: { ...common, growthRate: 0.1 },
    });
    expect(r.bull.fairValuePerShare).toBeGreaterThan(r.base.fairValuePerShare);
    expect(r.base.fairValuePerShare).toBeGreaterThan(r.bear.fairValuePerShare);
    expect(r.fairValueRange.high).toBe(r.bull.fairValuePerShare);
    expect(r.fairValueRange.low).toBe(r.bear.fairValuePerShare);
  });
});

describe("upsidePct", () => {
  it("computes upside vs current price", () => {
    expect(upsidePct(120, 100)).toBeCloseTo(20);
    expect(upsidePct(100, 0)).toBeNull();
  });
});
