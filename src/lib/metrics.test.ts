import { describe, it, expect } from "vitest";
import { despike, median, pctChange, maxDrawdownPct } from "./metrics";

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("despike", () => {
  it("replaces a single bad tick with the local median", () => {
    const series = [100, 101, 99, 100, 2000, 100, 101, 99, 100, 102, 98, 100];
    const clean = despike(series);
    expect(clean[4]).toBeLessThan(200); // the 2000 spike is removed
    expect(clean[0]).toBe(100); // normal values untouched
  });

  it("survives a multi-day spike BLOCK without dropping legit values", () => {
    // 3-day spike block (indices 5-7); wide window keeps it a minority.
    const series = [
      200, 205, 210, 208, 212, 2100, 2150, 2090, 213, 209, 211, 207, 210, 206, 208, 212, 209, 210,
    ];
    const clean = despike(series);
    expect(clean[5]).toBeLessThan(400);
    expect(clean[6]).toBeLessThan(400);
    expect(clean[7]).toBeLessThan(400);
    // Legit values on both edges are preserved.
    expect(clean[0]).toBe(200);
    expect(clean[clean.length - 1]).toBe(210);
  });

  it("preserves a genuine trend (no false positives)", () => {
    const trend = Array.from({ length: 40 }, (_, i) => 100 + i * 2); // steady ramp
    const clean = despike(trend);
    expect(clean).toEqual(trend);
  });

  it("does not mutate the input array", () => {
    const series = [100, 100, 5000, 100, 100];
    const copy = [...series];
    despike(series);
    expect(series).toEqual(copy);
  });
});

describe("pctChange / maxDrawdownPct", () => {
  it("computes percent change and guards divide-by-zero", () => {
    expect(pctChange(100, 110)).toBeCloseTo(10);
    expect(pctChange(0, 110)).toBeNull();
  });

  it("computes max drawdown from a running peak", () => {
    expect(maxDrawdownPct([100, 120, 90, 130])).toBeCloseTo(-25); // 120 -> 90
    expect(maxDrawdownPct([100, 101, 102])).toBe(0);
  });
});
