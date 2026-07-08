import { describe, it, expect } from "vitest";
import { computeCapexName, computeCapexScorecard, HYPERSCALERS } from "./capex-scorecard";

/** n quarters ending 2026-03-31, capex stored NEGATIVE (cash-flow convention). */
function quarters(perQuarter: number[], startYear = 2024): { periodEnd: string; capex: number | null }[] {
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  return perQuarter.map((c, i) => ({
    periodEnd: `${startYear + Math.floor(i / 4)}-${ends[i % 4]}`,
    capex: c === Number.MIN_SAFE_INTEGER ? null : -c,
  }));
}

describe("computeCapexName", () => {
  it("computes TTM and YoY growth from 8 quarters (signs normalized)", () => {
    const name = computeCapexName("MSFT", quarters([10, 10, 10, 10, 12, 13, 12, 13]));
    expect(name.ttmCapex).toBe(50); // 12+13+12+13
    expect(name.yoyGrowthPct).toBe(25); // 50 vs 40
    expect(name.warnings).toEqual([]);
    expect(name.quarterly.every((q) => (q.capex ?? 0) >= 0)).toBe(true);
  });

  it("warns and returns null TTM with fewer than 4 quarters", () => {
    const name = computeCapexName("GOOGL", quarters([10, 11, 12]));
    expect(name.ttmCapex).toBeNull();
    expect(name.yoyGrowthPct).toBeNull();
    expect(name.warnings[0]).toMatch(/only 3 quarters/);
  });

  it("null capex inside the TTM window yields null + warning, never a silent zero", () => {
    const rows = quarters([10, 10, 10, 10, 12, 13, Number.MIN_SAFE_INTEGER, 13]);
    const name = computeCapexName("AMZN", rows);
    expect(name.ttmCapex).toBeNull();
    expect(name.warnings.some((w) => w.includes("missing"))).toBe(true);
  });

  it("YoY unavailable with only 4 quarters produces a warning", () => {
    const name = computeCapexName("META", quarters([10, 10, 10, 10]));
    expect(name.ttmCapex).toBe(40);
    expect(name.yoyGrowthPct).toBeNull();
    expect(name.warnings.some((w) => w.includes("YoY"))).toBe(true);
  });

  it("dedupes duplicate periodEnd rows, preferring the row with a value", () => {
    const rows = [
      { periodEnd: "2025-03-31", capex: null },
      { periodEnd: "2025-03-31", capex: -9 },
      ...quarters([10, 10, 10], 2024).slice(0, 3),
    ];
    const name = computeCapexName("MSFT", rows);
    expect(name.ttmCapex).toBe(39);
  });

  it("caps the sparkline series at the last 12 quarters", () => {
    const name = computeCapexName("MSFT", quarters(Array.from({ length: 16 }, (_, i) => i + 1)));
    expect(name.quarterly).toHaveLength(12);
    expect(name.quarterly[0].periodEnd > "2024-12-31").toBe(true);
  });
});

describe("computeCapexScorecard", () => {
  const full = {
    MSFT: quarters([10, 10, 10, 10, 12, 12, 12, 12]),
    AMZN: quarters([20, 20, 20, 20, 22, 22, 22, 22]),
    GOOGL: quarters([15, 15, 15, 15, 18, 18, 18, 18]),
    META: quarters([8, 8, 8, 8, 9, 9, 9, 9]),
  };

  it("combined TTM and YoY across all four hyperscalers", () => {
    const card = computeCapexScorecard(full);
    expect(card.names.map((n) => n.symbol)).toEqual([...HYPERSCALERS]);
    expect(card.combinedTtm).toBe(48 + 88 + 72 + 36); // 244
    // combined: 244 vs 212 prior
    expect(card.combinedYoyPct).toBeCloseTo(((244 - 212) / 212) * 100, 0);
    expect(card.warnings).toEqual([]);
  });

  it("partial data → partial combined TTM with warning, no mixed-basis YoY", () => {
    const card = computeCapexScorecard({ ...full, GOOGL: quarters([15, 15]) });
    expect(card.combinedTtm).toBe(48 + 88 + 36);
    expect(card.combinedYoyPct).toBeNull();
    expect(card.warnings.some((w) => w.includes("3/4"))).toBe(true);
  });

  it("no data at all → null totals, warnings per name", () => {
    const card = computeCapexScorecard({});
    expect(card.combinedTtm).toBeNull();
    expect(card.combinedYoyPct).toBeNull();
    expect(card.warnings.length).toBeGreaterThanOrEqual(4);
  });
});
