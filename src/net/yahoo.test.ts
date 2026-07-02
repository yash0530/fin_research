import { describe, it, expect } from "vitest";
import { parseChart, parseQuoteBatch } from "./yahoo";

describe("parseChart", () => {
  it("maps timestamps→YYYY-MM-DD and drops null closes", () => {
    const json = {
      chart: {
        result: [
          {
            timestamp: [1704067200, 1704153600, 1704240000], // 2024-01-01, 01-02, 01-03
            indicators: { quote: [{ close: [100.5, null, 102.25] }] },
          },
        ],
      },
    };
    const rows = parseChart("mu", json);
    expect(rows).toEqual([
      { symbol: "MU", d: "2024-01-01", close: 100.5 },
      { symbol: "MU", d: "2024-01-03", close: 102.25 }, // null skipped
    ]);
  });

  it("returns empty on an error/empty response", () => {
    expect(parseChart("X", {})).toEqual([]);
    expect(parseChart("X", { chart: { error: "not found" } })).toEqual([]);
  });
});

describe("parseQuoteBatch", () => {
  it("extracts per-symbol stats and nulls non-finite fields", () => {
    const json = {
      quoteResponse: {
        result: [
          { symbol: "MU", regularMarketPrice: 90, marketCap: 1.3e11, forwardPE: 11 },
          { symbol: "nvda", regularMarketPrice: 120 },
        ],
      },
    };
    const rows = parseQuoteBatch(json);
    expect(rows[0]).toMatchObject({ symbol: "MU", price: 90, forwardPE: 11 });
    expect(rows[1]).toMatchObject({ symbol: "NVDA", price: 120, marketCap: null, beta: null });
  });

  it("returns empty when there are no results", () => {
    expect(parseQuoteBatch({})).toEqual([]);
  });
});
