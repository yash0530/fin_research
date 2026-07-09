import { describe, it, expect } from "vitest";
import { computeSuperinvestorOverlap, type ScreenHoldingInput } from "./superinvestor-overlap";

describe("superinvestor-overlap screen", () => {
  const cusipMap = new Map<string, string>([
    ["CUSIP1", "AAPL"],
    ["CUSIP2", "MSFT"],
    ["CUSIP3", "GOOG"],
  ]);

  it("groups holdings by symbol, sorts by holder count, and returns aggregated counts", () => {
    const holdings: ScreenHoldingInput[] = [
      {
        filerCik: "CIK1",
        filerName: "Buffett",
        periodOfReport: "2023-03-31",
        cusip: "CUSIP1",
        nameOfIssuer: "APPLE INC",
        value: 1000,
        shares: 10,
        filedAt: "2023-05-15",
      },
      {
        filerCik: "CIK2",
        filerName: "Burry",
        periodOfReport: "2023-03-31",
        cusip: "CUSIP1",
        nameOfIssuer: "APPLE INC",
        value: 500,
        shares: 5,
        filedAt: "2023-05-15",
      },
      {
        filerCik: "CIK1",
        filerName: "Buffett",
        periodOfReport: "2023-03-31",
        cusip: "CUSIP2",
        nameOfIssuer: "MICROSOFT CORP",
        value: 2000,
        shares: 20,
        filedAt: "2023-05-15",
      },
    ];

    const results = computeSuperinvestorOverlap(holdings, cusipMap);
    expect(results).toHaveLength(2);

    // AAPL should be first (holderCount = 2)
    expect(results[0].symbol).toBe("AAPL");
    expect(results[0].holderCount).toBe(2);
    expect(results[0].holders).toHaveLength(2);
    expect(results[0].holders).toContainEqual({ name: "Buffett", shares: 10, value: 1000 });
    expect(results[0].holders).toContainEqual({ name: "Burry", shares: 5, value: 500 });

    // MSFT should be second (holderCount = 1)
    expect(results[1].symbol).toBe("MSFT");
    expect(results[1].holderCount).toBe(1);
  });

  it("correctly identifies new holdings this quarter (newThisQuarter)", () => {
    const holdings: ScreenHoldingInput[] = [
      // Filer 1 (Buffett) holdings in Q4 2022
      {
        filerCik: "CIK1",
        filerName: "Buffett",
        periodOfReport: "2022-12-31",
        cusip: "CUSIP1",
        nameOfIssuer: "APPLE INC",
        value: 1000,
        shares: 10,
        filedAt: "2023-02-15",
      },
      // Filer 1 (Buffett) holdings in Q1 2023: kept AAPL, added MSFT
      {
        filerCik: "CIK1",
        filerName: "Buffett",
        periodOfReport: "2023-03-31",
        cusip: "CUSIP1",
        nameOfIssuer: "APPLE INC",
        value: 1000,
        shares: 10,
        filedAt: "2023-05-15",
      },
      {
        filerCik: "CIK1",
        filerName: "Buffett",
        periodOfReport: "2023-03-31",
        cusip: "CUSIP2",
        nameOfIssuer: "MICROSOFT CORP",
        value: 500,
        shares: 5,
        filedAt: "2023-05-15",
      },
    ];

    const results = computeSuperinvestorOverlap(holdings, cusipMap);

    // AAPL is not new this quarter (held in both periods)
    const aapl = results.find((r) => r.symbol === "AAPL");
    expect(aapl).toBeDefined();
    expect(aapl?.newThisQuarter).toBe(false);

    // MSFT is new this quarter (held in latest period, not in previous, and filer has history)
    const msft = results.find((r) => r.symbol === "MSFT");
    expect(msft).toBeDefined();
    expect(msft?.newThisQuarter).toBe(true);
  });

  it("ignores unmapped CUSIPs", () => {
    const holdings: ScreenHoldingInput[] = [
      {
        filerCik: "CIK1",
        filerName: "Buffett",
        periodOfReport: "2023-03-31",
        cusip: "UNKNOWN_CUSIP",
        nameOfIssuer: "SOME CORP",
        value: 1000,
        shares: 10,
        filedAt: "2023-05-15",
      },
    ];

    const results = computeSuperinvestorOverlap(holdings, cusipMap);
    expect(results).toHaveLength(0);
  });
});
