import { describe, it, expect } from "vitest";
import { sma, ema, rsi, macd, maCrossState, fiftyTwoWeek } from "./technicals";

describe("sma / ema", () => {
  it("sma of the last `period` values", () => {
    expect(sma([2, 4, 6, 8], 2)).toBe(7); // (6+8)/2
    expect(sma([1, 2], 5)).toBeNull();
  });
  it("ema of a constant series is that constant", () => {
    expect(ema([1, 1, 1, 1], 3)).toBeCloseTo(1, 10);
  });
});

describe("rsi (Wilder)", () => {
  it("is 100 for a strictly rising series (no losses)", () => {
    const up = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(rsi(up, 14)).toBe(100);
  });
  it("is 0 for a strictly falling series (no gains)", () => {
    const down = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(rsi(down, 14)).toBe(0);
  });
  it("is null with insufficient data", () => {
    expect(rsi([1, 2, 3], 14)).toBeNull();
  });
});

describe("macd", () => {
  it("is positive on a sustained uptrend, ~0 on a flat series", () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i);
    const flat = Array.from({ length: 40 }, () => 100);
    expect(macd(up)!.macd).toBeGreaterThan(0);
    expect(Math.abs(macd(flat)!.macd)).toBeLessThan(1e-9);
    expect(macd([1, 2, 3])).toBeNull();
  });
});

describe("maCrossState", () => {
  it("is bull when the short SMA is above the long SMA (rising ramp)", () => {
    const ramp = Array.from({ length: 250 }, (_, i) => i);
    expect(maCrossState(ramp, 50, 200)).toBe("bull");
  });
  it("is none without enough data", () => {
    expect(maCrossState([1, 2, 3], 50, 200)).toBe("none");
  });
});

describe("fiftyTwoWeek", () => {
  it("flags a new high and computes distance from extremes", () => {
    const r = fiftyTwoWeek([10, 20, 30])!;
    expect(r.high).toBe(30);
    expect(r.low).toBe(10);
    expect(r.newHigh).toBe(true);
    expect(r.pctFromHigh).toBeCloseTo(0);
  });
  it("computes negative distance below the high", () => {
    const r = fiftyTwoWeek([30, 20, 10])!;
    expect(r.newHigh).toBe(false);
    expect(r.pctFromHigh).toBeCloseTo(-66.6667, 3);
  });
});
