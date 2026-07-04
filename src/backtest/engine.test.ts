import { describe, it, expect } from "vitest";
import { forwardReturnPct, monthEndGrid, mean, scoreSignal } from "./engine";

describe("backtest engine pure functions", () => {
  describe("mean", () => {
    it("returns 0 for empty array", () => {
      expect(mean([])).toBe(0);
    });

    it("calculates correct mean for numbers", () => {
      expect(mean([1, 2, 3, 4])).toBe(2.5);
      expect(mean([10])).toBe(10);
    });
  });

  describe("forwardReturnPct", () => {
    it("returns correct percent return snapping to nearest bar", () => {
      const bars = [
        { d: "2020-01-01", close: 100 },
        { d: "2020-01-10", close: 110 },
        { d: "2020-01-20", close: 120 },
        { d: "2020-01-30", close: 130 },
      ];

      // start: nearest-before/on 2020-01-05 is 2020-01-01 (close: 100)
      // end: nearest-on/after 2020-01-05 + 10 days = 2020-01-15 is 2020-01-20 (close: 120)
      // expected: (120 - 100) / 100 * 100 = 20%
      const ret = forwardReturnPct(bars, "2020-01-05", 10);
      expect(ret).toBe(20);
    });

    it("returns null if start bar is missing", () => {
      const bars = [
        { d: "2020-01-10", close: 110 },
        { d: "2020-01-20", close: 120 },
      ];
      // fromD = 2020-01-05. Nearest-before 2020-01-05 doesn't exist.
      expect(forwardReturnPct(bars, "2020-01-05", 5)).toBeNull();
    });

    it("returns null if end bar is missing", () => {
      const bars = [
        { d: "2020-01-01", close: 100 },
        { d: "2020-01-10", close: 110 },
      ];
      // fromD = 2020-01-01, horizonDays = 15 => target 2020-01-16. No bar on/after 2020-01-16.
      expect(forwardReturnPct(bars, "2020-01-01", 15)).toBeNull();
    });

    it("handles out-of-order input bars correctly by sorting them", () => {
      const bars = [
        { d: "2020-01-20", close: 120 },
        { d: "2020-01-01", close: 100 },
        { d: "2020-01-30", close: 130 },
        { d: "2020-01-10", close: 110 },
      ];
      const ret = forwardReturnPct(bars, "2020-01-05", 10);
      expect(ret).toBe(20);
    });

    it("applies despiking on price series", () => {
      // 12 bars with a single major spike at index 5
      const bars = [
        { d: "2020-01-01", close: 100 },
        { d: "2020-01-02", close: 101 },
        { d: "2020-01-03", close: 102 },
        { d: "2020-01-04", close: 103 },
        { d: "2020-01-05", close: 104 },
        { d: "2020-01-06", close: 5000 }, // SPIKE
        { d: "2020-01-07", close: 106 },
        { d: "2020-01-08", close: 107 },
        { d: "2020-01-09", close: 108 },
        { d: "2020-01-10", close: 109 },
        { d: "2020-01-11", close: 110 },
        { d: "2020-01-12", close: 111 },
      ];

      // start: 2020-01-05 (close: 104)
      // end: target is 2020-01-06 (close: 5000 raw, but should be despiked to ~105 local median)
      // If not despiked, return is (5000 - 104)/104 * 100 ≈ 4700%
      // If despiked, return is (105 - 104)/104 * 100 ≈ 0.96%
      const ret = forwardReturnPct(bars, "2020-01-05", 1);
      expect(ret).toBeLessThan(10); 
    });
  });

  describe("monthEndGrid", () => {
    it("returns correct month-end dates for a 3-month span", () => {
      const dates = monthEndGrid("2020-01-15", "2020-04-15");
      expect(dates).toEqual(["2020-01-31", "2020-02-29", "2020-03-31"]);
    });

    it("returns empty array when start date is after end date", () => {
      expect(monthEndGrid("2020-05-01", "2020-04-01")).toEqual([]);
    });

    it("includes start and end dates if they are exact month ends", () => {
      const dates = monthEndGrid("2020-01-31", "2020-03-31");
      expect(dates).toEqual(["2020-01-31", "2020-02-29", "2020-03-31"]);
    });
  });

  describe("scoreSignal", () => {
    it("scores correctly when flagged beats baseline (positive excess, hitRate > 0.5)", () => {
      const res = scoreSignal([2, 3, 4, 5], 2.5);
      expect(res.n).toBe(4);
      expect(res.flaggedMean).toBe(3.5);
      expect(res.baselineMean).toBe(2.5);
      expect(res.excess).toBe(1.0);
      expect(res.hitRate).toBe(0.75); // 3 of 4 are > 2.5
    });

    it("scores correctly when flagged loses (negative excess)", () => {
      const res = scoreSignal([1, 2, 2, 3], 2.5);
      expect(res.n).toBe(4);
      expect(res.flaggedMean).toBe(2.0);
      expect(res.baselineMean).toBe(2.5);
      expect(res.excess).toBe(-0.5);
      expect(res.hitRate).toBe(0.25); // 1 of 4 is > 2.5
    });

    it("returns zeros on empty input", () => {
      const res = scoreSignal([], 2.5);
      expect(res.n).toBe(0);
      expect(res.flaggedMean).toBe(0);
      expect(res.baselineMean).toBe(2.5);
      expect(res.excess).toBe(-2.5);
      expect(res.hitRate).toBe(0);
    });
  });
});
