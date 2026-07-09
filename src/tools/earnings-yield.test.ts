import { describe, it, expect } from "vitest";
import { computeEarningsYieldBands } from "./earnings-yield";
import { FundamentalsQuarter } from "../screens/types";

describe("earnings-yield tool", () => {
  const createMockQuarter = (periodEnd: string, overrides: Partial<FundamentalsQuarter> = {}): FundamentalsQuarter => ({
    symbol: "TEST",
    periodEnd,
    netIncome: 100, // TTM NI = 400
    sharesOut: 10,  // TTM EPS = 40
    ...overrides,
  });

  const createMockQuarters = (count: number, overridesList: Partial<FundamentalsQuarter>[] = []): FundamentalsQuarter[] => {
    const quarters: FundamentalsQuarter[] = [];
    for (let i = 0; i < count; i++) {
      const year = 2020 + Math.floor(i / 4);
      const q = (i % 4) + 1;
      const month = q === 1 ? "03" : q === 2 ? "06" : q === 3 ? "09" : "12";
      const overrides = overridesList[i] || {};
      quarters.push(createMockQuarter(`${year}-${month}-31`, overrides));
    }
    return quarters;
  };

  const createPrices = (dates: string[], price: number): { d: string; close: number }[] => {
    return dates.map(d => ({ d, close: price }));
  };

  it("should calculate correct earnings yield and spread", () => {
    // 4 quarters, TTM NI = 400, shares = 10 -> EPS = 40. Price = 400 -> E/P = 40 / 400 = 10% (0.10)
    const quarters = createMockQuarters(4);
    const prices = createPrices(["2020-03-31", "2020-06-30", "2020-09-30", "2020-12-31"], 400);
    const result = computeEarningsYieldBands(prices, quarters, 0.04);

    expect(result.current).not.toBeNull();
    expect(result.current?.earningsYield).toBeCloseTo(0.10);
    expect(result.spread).toBeCloseTo(0.06); // 10% - 4% = 6%
    expect(result.verdict).toBe("suspended"); // not enough historical data for bands
  });

  it("should compute bands and output correct verdict (cheap, fair, rich)", () => {
    // Generate monthly prices over 6 years to have enough history for bands
    // 24 quarters
    const quarters = createMockQuarters(24);
    
    // We want price to change over time so we have a distribution of E/P
    // TTM EPS is always 40 (since NI is 100/q, shares is 10).
    // Let's create monthly prices:
    // For 72 months, price is mostly 400 (E/P = 10%), but lets add some variation:
    // Prices: 300 (E/P = 13.3%), 400 (E/P = 10%), 500 (E/P = 8%)
    const dates: string[] = [];
    const closes: number[] = [];
    for (let y = 2020; y <= 2025; y++) {
      for (let m = 1; m <= 12; m++) {
        const monthStr = m < 10 ? `0${m}` : `${m}`;
        dates.push(`${y}-${monthStr}-28`);
        // Let's vary the prices to generate a band
        if (m % 3 === 0) closes.push(300);
        else if (m % 3 === 1) closes.push(400);
        else closes.push(500);
      }
    }

    const prices = dates.map((d, i) => ({ d, close: closes[i] }));

    // E/P values: 40/300 = 0.133, 40/400 = 0.10, 40/500 = 0.08
    // Median of [0.08, 0.10, 0.1333] is 0.10.
    // MAD = median of [|0.08-0.10|, |0.10-0.10|, |0.1333-0.10|] = median of [0.02, 0, 0.0333] = 0.02.
    // Step = 1.4826 * 0.02 = 0.02965
    // Low1 = 0.10 - 0.02965 = 0.07035
    // High1 = 0.10 + 0.02965 = 0.12965

    // Let's test different current prices:
    // 1. Current Price = 550 -> E/P = 40/550 = 0.0727 -> between 0.07035 and 0.12965 -> fair
    const pricesFair = [...prices, { d: "2026-01-31", close: 550 }];
    const resFair = computeEarningsYieldBands(pricesFair, quarters);
    expect(resFair.verdict).toBe("fair");

    // 2. Current Price = 250 -> E/P = 40/250 = 0.16 -> above 0.12965 -> cheap (high yield)
    const pricesCheap = [...prices, { d: "2026-01-31", close: 250 }];
    const resCheap = computeEarningsYieldBands(pricesCheap, quarters);
    expect(resCheap.verdict).toBe("cheap");

    // 3. Current Price = 600 -> E/P = 40/600 = 0.0667 -> below 0.07035 -> rich (low yield)
    const pricesRich = [...prices, { d: "2026-01-31", close: 600 }];
    const resRich = computeEarningsYieldBands(pricesRich, quarters);
    expect(resRich.verdict).toBe("rich");
  });

  it("should suspend verdict on negative earnings", () => {
    // Current quarter has negative earnings
    const quarters = createMockQuarters(4, [{}, {}, {}, { netIncome: -200 }]); // TTM NI = 100+100+100-200 = 100.
    // Wait, let's make TTM NI negative: TTM NI = 100+100-200-200 = -200.
    const quartersNeg = createMockQuarters(4, [{}, {}, { netIncome: -200 }, { netIncome: -200 }]);
    const prices = createPrices(["2020-03-31", "2020-06-30", "2020-09-30", "2020-12-31"], 400);
    const result = computeEarningsYieldBands(prices, quartersNeg);

    expect(result.current?.earningsYield).toBeLessThan(0);
    expect(result.verdict).toBe("suspended");
  });
});
