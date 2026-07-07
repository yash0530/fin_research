import { describe, it, expect } from "vitest";
import { computeValuationHistory } from "./valuation-history";
import { FundamentalsQuarter } from "../screens/types";

describe("valuation history tool", () => {
  const createMockPrices = (count: number, startPrice: number): { d: string; close: number }[] => {
    const prices: { d: string; close: number }[] = [];
    for (let i = 0; i < count; i++) {
      const year = 2020 + Math.floor(i / 12);
      const month = String((i % 12) + 1).padStart(2, "0");
      // Add multiple days in the month to test monthly sampling (latest-d-per-month logic)
      prices.push({ d: `${year}-${month}-15`, close: startPrice + i * 0.9 });
      prices.push({ d: `${year}-${month}-28`, close: startPrice + i * 1.0 });
    }
    return prices;
  };

  const createMockQuarters = (count: number, niVal: number, revVal: number, fcfVal: number): FundamentalsQuarter[] => {
    const quarters: FundamentalsQuarter[] = [];
    for (let i = 0; i < count; i++) {
      const year = 2018 + Math.floor(i / 4);
      const q = (i % 4) + 1;
      const month = q === 1 ? "03" : q === 2 ? "06" : q === 3 ? "09" : "12";
      quarters.push({
        symbol: "TEST",
        periodEnd: `${year}-${month}-31`,
        netIncome: niVal,
        revenue: revVal,
        fcf: fcfVal,
        sharesOut: 10,
      });
    }
    return quarters;
  };

  it("should sample prices monthly and compute multiples", () => {
    // 24 months of prices
    const prices = createMockPrices(24, 100);
    // 40 quarters of fundamentals
    const quarters = createMockQuarters(40, 10, 100, 5); // TTM EPS = (4 * 10) / 10 = 4. TTM SPS = 40. TTM FPS = 2

    const result = computeValuationHistory(prices, quarters);

    expect(result.series).toHaveLength(24);
    // Let's verify latest sample (index 23):
    // price = 100 + 23 = 123
    const latest = result.current;
    expect(latest).not.toBeNull();
    expect(latest?.price).toBe(123);
    // PE = 123 / 4 = 30.75
    // PS = 123 / 40 = 3.075
    // PFCF = 123 / 2 = 61.5
    expect(latest?.pe).toBeCloseTo(30.75, 2);
    expect(latest?.ps).toBeCloseTo(3.075, 2);
    expect(latest?.pfcf).toBeCloseTo(61.5, 2);
  });

  it("should suspend PE / PFCF and fallback to PS when netIncome / FCF are non-positive", () => {
    const prices = createMockPrices(12, 100);
    // netIncome = -5 (so TTM EPS = -2 <= 0), fcf = 0 (so TTM FPS = 0 <= 0), revenue = 100 (so TTM SPS = 40 > 0)
    const quarters = createMockQuarters(20, -5, 100, 0);

    const result = computeValuationHistory(prices, quarters);

    const latest = result.current;
    expect(latest).not.toBeNull();
    expect(latest?.pe).toBeNull();
    expect(latest?.pfcf).toBeNull();
    expect(latest?.ps).not.toBeNull();

    expect(result.bands.pe).toBeNull();
    expect(result.bands.pfcf).toBeNull();
    expect(result.bands.ps).not.toBeNull();

    // Verdict should be decided using PS
    expect(result.verdict).not.toBe("suspended");
  });
});
