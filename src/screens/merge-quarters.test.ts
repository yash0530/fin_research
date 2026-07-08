import { describe, it, expect } from "vitest";
import { mergeQuarters } from "./merge-quarters";
import type { FundamentalsQuarter } from "./types";

const q = (periodEnd: string, o: Partial<FundamentalsQuarter> = {}): FundamentalsQuarter => ({
  symbol: "AAPL",
  periodEnd,
  ...o,
});

describe("mergeQuarters", () => {
  it("merges two rows for the same fiscal quarter, coalescing complementary fields", () => {
    // Yahoo row (month-end) has netIncome; EDGAR row (fiscal close, 3 days earlier) has cfo.
    const rows = [
      q("2025-12-31", { netIncome: 42097, cfo: null, totalAssets: 379297 }),
      q("2025-12-27", { netIncome: 42097, cfo: 53925, totalAssets: 379297 }),
    ];
    const merged = mergeQuarters(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].netIncome).toBe(42097);
    expect(merged[0].cfo).toBe(53925); // recovered from the sibling row
    expect(merged[0].periodEnd).toBe("2025-12-31"); // latest in the cluster
  });

  it("keeps genuinely distinct quarters separate (~90 days apart)", () => {
    const rows = [
      q("2025-09-30", { netIncome: 27466 }),
      q("2025-12-31", { netIncome: 42097 }),
      q("2026-03-31", { netIncome: 29578 }),
    ];
    const merged = mergeQuarters(rows);
    expect(merged).toHaveLength(3);
    expect(merged.map((m) => m.periodEnd)).toEqual(["2025-09-30", "2025-12-31", "2026-03-31"]);
  });

  it("prefers the later-dated row's value on a non-null conflict", () => {
    const rows = [
      q("2025-12-27", { netIncome: 100, sharesOut: 15000 }),
      q("2025-12-31", { netIncome: 100, sharesOut: 14900 }),
    ];
    expect(mergeQuarters(rows)[0].sharesOut).toBe(14900);
  });

  it("returns oldest→newest and is idempotent on clean input", () => {
    const clean = [
      q("2025-06-30", { netIncome: 10, revenue: 90 }),
      q("2025-09-30", { netIncome: 12, revenue: 95 }),
    ];
    const once = mergeQuarters(clean);
    const twice = mergeQuarters(once);
    expect(once).toEqual(twice);
    expect(once.map((m) => m.periodEnd)).toEqual(["2025-06-30", "2025-09-30"]);
  });

  it("drops non-reporting fiscal-Q4 rows (balance-sheet only, no flows)", () => {
    const rows = [
      q("2025-03-31", { netIncome: 25824, cfo: 37044, totalAssets: 500000 }),
      // MSFT June quarter: balance-sheet instants present, flows null → not a
      // reporting quarter for income/cash-flow screens.
      q("2025-06-30", { netIncome: null, cfo: null, totalAssets: 619003, equity: 343479 }),
      q("2025-09-30", { netIncome: 27747, cfo: 45057, totalAssets: 520000 }),
      q("2025-12-31", { netIncome: 38458, cfo: 35758, totalAssets: 530000 }),
    ];
    const merged = mergeQuarters(rows);
    expect(merged).toHaveLength(3);
    expect(merged.map((m) => m.periodEnd)).toEqual(["2025-03-31", "2025-09-30", "2025-12-31"]);
  });

  it("keeps a reported loss quarter (netIncome present and negative)", () => {
    const rows = [
      q("2025-03-31", { netIncome: -500, cfo: 100, totalAssets: 1000 }),
      q("2025-06-30", { netIncome: 200, cfo: 150, totalAssets: 1100 }),
    ];
    expect(mergeQuarters(rows)).toHaveLength(2);
  });

  it("handles a 3-row cluster and empty input", () => {
    expect(mergeQuarters([])).toEqual([]);
    const cluster = [
      q("2026-03-31", { revenue: 111184 }),
      q("2026-03-28", { cfo: 24000, netIncome: 29578 }),
      q("2026-03-29", { totalAssets: 371082 }),
    ];
    const merged = mergeQuarters(cluster);
    expect(merged).toHaveLength(1);
    expect(merged[0].revenue).toBe(111184);
    expect(merged[0].cfo).toBe(24000);
    expect(merged[0].totalAssets).toBe(371082);
  });
});
