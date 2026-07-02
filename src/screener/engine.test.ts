import { describe, it, expect } from "vitest";
import { runScreen, screenableFields, type TickerRow } from "./engine";

const ROWS: TickerRow[] = [
  { symbol: "NVDA", gicsCode: "g_info_tech", aiCodes: ["ai_compute_gpu"], marketCap: 3000, forwardPE: 35, watchlisted: true },
  { symbol: "MU", gicsCode: "g_info_tech", aiCodes: ["ai_memory"], marketCap: 120, forwardPE: 12, watchlisted: true },
  { symbol: "JPM", gicsCode: "g_financials", aiCodes: [], marketCap: 500, forwardPE: 11 },
  { symbol: "KO", gicsCode: "g_consumer_staples", aiCodes: [], marketCap: 250, forwardPE: 24 },
  { symbol: "XOM", gicsCode: "g_energy", aiCodes: [], marketCap: 450, forwardPE: null }, // missing PE
];

describe("runScreen", () => {
  it("screens the whole universe by a value filter", () => {
    const r = runScreen(ROWS, { universe: "sp500", filters: [{ field: "forwardPE", op: "lt", value: 20 }] });
    expect(r.scanned).toBe(5);
    expect(r.matched.map((x) => x.symbol).sort()).toEqual(["JPM", "MU"]); // XOM excluded (missing PE)
  });

  it("restricts to the AI-infra universe", () => {
    const r = runScreen(ROWS, { universe: "ai_infra", filters: [] });
    expect(r.matched.map((x) => x.symbol).sort()).toEqual(["MU", "NVDA"]);
  });

  it("restricts to the watchlist", () => {
    const r = runScreen(ROWS, { universe: "watchlist", filters: [] });
    expect(r.matched.map((x) => x.symbol).sort()).toEqual(["MU", "NVDA"]);
  });

  it("restricts to a sector code (GICS or AI)", () => {
    expect(runScreen(ROWS, { universe: "sector:g_financials", filters: [] }).matched.map((x) => x.symbol)).toEqual(["JPM"]);
    expect(runScreen(ROWS, { universe: "sector:ai_memory", filters: [] }).matched.map((x) => x.symbol)).toEqual(["MU"]);
  });

  it("supports between, sort desc, and limit", () => {
    const r = runScreen(ROWS, {
      universe: "sp500",
      filters: [{ field: "marketCap", op: "between", value: 100, value2: 1000 }],
      sort: { field: "marketCap", dir: "desc" },
      limit: 2,
    });
    expect(r.matched.map((x) => x.symbol)).toEqual(["JPM", "XOM"]); // 500, 450 (top 2 of 100..1000)
  });

  it("exposes the screenable field namespace", () => {
    expect(screenableFields()).toContain("forwardPE");
    expect(screenableFields()).toContain("marketCap");
  });
});
