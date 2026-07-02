import { describe, it, expect } from "vitest";
import { macroContext } from "./macro";
import { peerCompare, type PeerRow } from "./peer-compare";
import { upcomingCatalysts, type CatalystEvent } from "./catalysts";

describe("macroContext", () => {
  it("flags risk-off on elevated VIX", () => {
    const m = macroContext({ vix: 30 });
    expect(m.regime).toBe("risk_off");
    expect(m.notes.join(" ")).toMatch(/VIX/);
  });
  it("is risk-on on a calm, non-inverted tape", () => {
    const m = macroContext({ vix: 12, tnx: 4, irx: 3 });
    expect(m.regime).toBe("risk_on");
    expect(m.yieldCurveInverted).toBe(false);
  });
  it("detects an inverted yield curve", () => {
    expect(macroContext({ tnx: 4, irx: 5 }).yieldCurveInverted).toBe(true);
  });
});

describe("peerCompare", () => {
  const cohort: PeerRow[] = [
    { symbol: "MU", forwardPE: 11, revenueGrowthPct: 58 },
    { symbol: "NVDA", forwardPE: 34, revenueGrowthPct: 62 },
    { symbol: "AVGO", forwardPE: 28, revenueGrowthPct: 22 },
  ];
  it("computes percentile position within the cohort", () => {
    const p = peerCompare("MU", cohort);
    expect(p.cohortSize).toBe(3);
    expect(p.percentiles.forwardPE).toBeCloseTo(33.333, 2); // 11 is cheapest → 1/3
    expect(p.percentiles.revenueGrowthPct).toBeCloseTo(66.667, 2); // 58 ≥ 2 of 3
    expect(p.percentiles.profitMarginPct).toBeNull(); // not provided
  });
});

describe("upcomingCatalysts", () => {
  const events: CatalystEvent[] = [
    { d: "2026-07-10", kind: "earnings", symbol: "MU", title: "MU Q3" },
    { d: "2026-08-20", kind: "earnings", symbol: "MU", title: "MU Q4 (beyond window)" },
    { d: "2026-07-05", kind: "macro", title: "CPI print" },
    { d: "2026-06-01", kind: "earnings", symbol: "MU", title: "past" },
  ];
  it("returns in-window events (incl. market-wide) sorted by date", () => {
    const up = upcomingCatalysts(events, { asOf: "2026-07-02", withinDays: 45, symbol: "MU" });
    expect(up.map((e) => e.title)).toEqual(["CPI print", "MU Q3"]);
  });
});
