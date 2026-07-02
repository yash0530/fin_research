import { describe, it, expect } from "vitest";
import { addMonthsISO, nearestCloseOnOrAfter, horizonReturns, type Bar } from "./outcomes";

describe("addMonthsISO", () => {
  it("clamps the day into a shorter target month (leap-year Feb)", () => {
    expect(addMonthsISO("2024-01-31", 1)).toBe("2024-02-29");
  });
  it("rolls the year over", () => {
    expect(addMonthsISO("2024-01-15", 12)).toBe("2025-01-15");
    expect(addMonthsISO("2024-11-10", 3)).toBe("2025-02-10");
  });
});

describe("nearestCloseOnOrAfter", () => {
  const bars: Bar[] = [
    { d: "2024-02-16", close: 110 },
    { d: "2024-04-16", close: 120 },
  ];
  it("returns the first close on or after the target", () => {
    expect(nearestCloseOnOrAfter(bars, "2024-02-15")).toBe(110);
    expect(nearestCloseOnOrAfter(bars, "2024-04-16")).toBe(120);
    expect(nearestCloseOnOrAfter(bars, "2025-01-01")).toBeNull();
  });
});

describe("horizonReturns", () => {
  it("fills due horizons and leaves not-yet-due ones null", () => {
    const bars: Bar[] = [
      { d: "2024-02-16", close: 110 },
      { d: "2024-04-16", close: 120 },
      { d: "2024-07-16", close: 130 },
    ];
    const r = horizonReturns("2024-01-15", 100, bars, "2024-07-01");
    expect(r.outcome1mPct).toBe(10); // 110 vs 100
    expect(r.outcome3mPct).toBe(20); // 120 vs 100
    expect(r.outcome6mPct).toBeNull(); // target 2024-07-15 > asOf 2024-07-01
    expect(r.outcome1yPct).toBeNull();
  });

  it("returns all null for a non-positive base price", () => {
    const r = horizonReturns("2024-01-15", 0, [{ d: "2024-02-16", close: 110 }], "2025-01-01");
    expect(r.outcome1mPct).toBeNull();
  });
});
