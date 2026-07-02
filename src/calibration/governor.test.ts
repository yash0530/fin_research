import { describe, it, expect } from "vitest";
import { isFavorable, governSize, tierStats, type CalRec } from "./governor";

const rec = (action: CalRec["action"], conviction: string, out3m: number | null): CalRec => ({
  action,
  conviction,
  outcome1mPct: null,
  outcome3mPct: out3m,
});

describe("isFavorable (per-action)", () => {
  it("BUY favorable when up, unfavorable when down", () => {
    expect(isFavorable(rec("BUY", "HIGH", 5))).toBe(true);
    expect(isFavorable(rec("BUY", "HIGH", -5))).toBe(false);
  });
  it("TRIM/AVOID favorable when down", () => {
    expect(isFavorable(rec("AVOID", "LOW", -5))).toBe(true);
    expect(isFavorable(rec("TRIM", "LOW", 5))).toBe(false);
  });
  it("HOLD favorable when roughly flat (|x|<=2.5)", () => {
    expect(isFavorable(rec("HOLD", "LOW", 1))).toBe(true);
    expect(isFavorable(rec("HOLD", "LOW", 5))).toBe(false);
  });
  it("unresolved → null", () => {
    expect(isFavorable(rec("BUY", "HIGH", null))).toBeNull();
  });
});

describe("governSize", () => {
  it("passes sizes already at/under the 2% cap", () => {
    expect(governSize("HIGH", 1.5, [])).toEqual({ governed: 1.5, reason: "" });
  });

  it("caps an unproven tier (fewer than 5 resolved) to 2%", () => {
    const recs = [rec("BUY", "HIGH", 10), rec("BUY", "HIGH", 10)]; // only 2 resolved
    const r = governSize("HIGH", 10, recs);
    expect(r.governed).toBe(2);
    expect(r.reason).toMatch(/5 needed/);
  });

  it("lifts the cap once a tier is proven (>=5 resolved, >=50% favorable)", () => {
    const recs = Array.from({ length: 5 }, () => rec("BUY", "HIGH", 12)); // all favorable
    const r = governSize("HIGH", 10, recs);
    expect(r.governed).toBe(10);
    expect(r.reason).toBe("");
  });

  it("keeps the cap when a proven-count tier is not favorable enough", () => {
    const recs = [
      rec("BUY", "HIGH", 5), rec("BUY", "HIGH", 5), // 2 favorable
      rec("BUY", "HIGH", -5), rec("BUY", "HIGH", -5), rec("BUY", "HIGH", -5), // 3 unfavorable
    ];
    const r = governSize("HIGH", 10, recs); // 40% favorable
    expect(r.governed).toBe(2);
    expect(r.reason).toMatch(/favorable only 40%/);
  });

  it("tierStats reports resolved count, favorable rate, and cap status", () => {
    const recs = Array.from({ length: 5 }, () => rec("BUY", "HIGH", 12));
    const high = tierStats(recs).find((t) => t.tier === "HIGH")!;
    expect(high.resolved).toBe(5);
    expect(high.favorableRate).toBe(1);
    expect(high.capLifted).toBe(true);
  });
});
