import { describe, it, expect } from "vitest";
import {
  mapChartToBars,
  mapQuoteBatch,
  mapFundamentals,
  mapQuoteStats,
  mapEarnings,
  mapPool,
  fetchDailyBars,
  fetchQuoteBatch,
  fetchQuarterlyFundamentals,
  fetchTickerStats,
  fetchEarningsDates,
  type Yahoo2Client,
} from "./yahoo2";

// A fake yahoo-finance2 client — no network. Each method is overridable per test.
function fakeClient(over: Partial<Yahoo2Client> = {}): Yahoo2Client {
  return {
    chart: async () => ({ quotes: [] }),
    quote: async () => [],
    quoteSummary: async () => ({}),
    fundamentalsTimeSeries: async () => [],
    ...over,
  };
}

const D = (s: string): Date => new Date(`${s}T00:00:00Z`);

describe("mapChartToBars", () => {
  it("maps quotes → YYYY-MM-DD bars, tags source, drops null closes", () => {
    const rows = mapChartToBars("mu", {
      quotes: [
        { date: D("2024-01-02"), close: 100.5, volume: 1000 },
        { date: D("2024-01-03"), close: null, volume: 2000 },
        { date: D("2024-01-04"), close: 102.25, volume: null },
      ],
    });
    expect(rows).toEqual([
      { symbol: "MU", d: "2024-01-02", close: 100.5, volume: 1000, source: "yahoo2" },
      { symbol: "MU", d: "2024-01-04", close: 102.25, volume: null, source: "yahoo2" },
    ]);
  });
});

describe("mapQuoteBatch", () => {
  it("extracts per-symbol stats and nulls missing/non-finite fields", () => {
    const rows = mapQuoteBatch([
      { symbol: "MU", regularMarketPrice: 90, marketCap: 1.3e11, forwardPE: 11, beta: 1.2 },
      { symbol: "nvda", regularMarketPrice: 120 },
      { notASymbol: true },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ symbol: "MU", price: 90, forwardPE: 11, beta: 1.2, source: "yahoo2" });
    expect(rows[1]).toMatchObject({ symbol: "NVDA", price: 120, marketCap: null, beta: null });
  });
});

describe("mapFundamentals", () => {
  it("merges income/balance/cash-flow entries sharing a period end", () => {
    const rows = mapFundamentals("mu", [
      { date: D("2024-08-31"), totalRevenue: 7000, grossProfit: 2000, operatingIncome: 1500 },
      { date: D("2024-08-31"), totalAssets: 68000, totalDebt: 12000, stockholdersEquity: 45000 },
      { date: D("2024-08-31"), freeCashFlow: 800, capitalExpenditure: -2500 },
      { date: D("2024-05-31"), totalRevenue: 6800 },
    ]);
    expect(rows.map((r) => r.periodEnd)).toEqual(["2024-05-31", "2024-08-31"]); // sorted
    const q3 = rows.find((r) => r.periodEnd === "2024-08-31")!;
    expect(q3).toMatchObject({
      symbol: "MU",
      revenue: 7000,
      grossProfit: 2000,
      operatingIncome: 1500,
      totalAssets: 68000,
      totalDebt: 12000,
      equity: 45000,
      fcf: 800,
      capex: -2500,
      source: "yahoo2",
    });
  });
});

describe("mapQuoteStats", () => {
  it("reads across defaultKeyStatistics / financialData / summaryDetail", () => {
    const s = mapQuoteStats("mu", {
      summaryDetail: { marketCap: 1.3e11, forwardPE: 11, trailingPE: 20, fiftyTwoWeekHigh: 150, fiftyTwoWeekLow: 80, beta: 1.3 },
      financialData: { currentPrice: 90, profitMargins: 0.22, revenueGrowth: 0.6 },
      defaultKeyStatistics: { trailingEps: 4.5, "52WeekChange": 0.35 },
    });
    expect(s).toMatchObject({
      symbol: "MU",
      price: 90,
      marketCap: 1.3e11,
      forwardPE: 11,
      trailingPE: 20,
      profitMargin: 0.22,
      revenueGrowth: 0.6,
      beta: 1.3,
      eps: 4.5,
      yearChange: 0.35,
      source: "yahoo2",
    });
  });
});

describe("mapEarnings", () => {
  it("maps calendarEvents earnings dates, deduped", () => {
    const rows = mapEarnings("mu", {
      calendarEvents: { earnings: { earningsDate: [D("2026-09-25"), D("2026-09-25"), D("2026-12-18")] } },
    });
    expect(rows).toEqual([
      { symbol: "MU", d: "2026-09-25", source: "yahoo2" },
      { symbol: "MU", d: "2026-12-18", source: "yahoo2" },
    ]);
  });

  it("returns [] when calendarEvents is missing", () => {
    expect(mapEarnings("X", {})).toEqual([]);
  });
});

describe("mapPool", () => {
  it("preserves order and respects concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const out = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});

describe("fetch wrappers never throw", () => {
  it("fetchDailyBars returns rows on success, [] + error on failure", async () => {
    const ok = await fetchDailyBars("MU", D("2020-01-01"), {
      client: fakeClient({ chart: async () => ({ quotes: [{ date: D("2024-01-02"), close: 100, volume: 1 }] }) }),
    });
    expect(ok.error).toBeNull();
    expect(ok.rows[0]).toMatchObject({ symbol: "MU", close: 100 });

    const bad = await fetchDailyBars("MU", D("2020-01-01"), {
      client: fakeClient({ chart: async () => { throw new Error("429 throttled"); } }),
    });
    expect(bad.rows).toEqual([]);
    expect(bad.error).toMatch(/429 throttled/);
  });

  it("fetchQuoteBatch chunks to ≤100 and aggregates errors per chunk", async () => {
    const seenBatches: number[] = [];
    const client = fakeClient({
      quote: async (syms: string[]) => {
        seenBatches.push(syms.length);
        if (syms.includes("BAD")) throw new Error("batch failed");
        return syms.map((s) => ({ symbol: s, regularMarketPrice: 1 }));
      },
    });
    const symbols = Array.from({ length: 150 }, (_, i) => `S${i}`);
    const res = await fetchQuoteBatch(symbols, { client, chunkSize: 100 });
    expect(seenBatches).toEqual([100, 50]); // chunked
    expect(res.rows).toHaveLength(150);
    expect(res.error).toBeNull();

    const withBad = await fetchQuoteBatch(["BAD"], { client });
    expect(withBad.rows).toEqual([]);
    expect(withBad.error).toMatch(/batch failed/);
  });

  it("fetchQuarterlyFundamentals maps entries and never throws", async () => {
    const res = await fetchQuarterlyFundamentals("MU", {
      client: fakeClient({ fundamentalsTimeSeries: async () => [{ date: D("2024-08-31"), totalRevenue: 7000 }] }),
    });
    expect(res.error).toBeNull();
    expect(res.rows[0]).toMatchObject({ periodEnd: "2024-08-31", revenue: 7000 });

    const bad = await fetchQuarterlyFundamentals("MU", {
      client: fakeClient({ fundamentalsTimeSeries: async () => { throw new Error("no data"); } }),
    });
    expect(bad.rows).toEqual([]);
    expect(bad.error).toMatch(/no data/);
  });

  it("fetchTickerStats returns stats or null+error", async () => {
    const ok = await fetchTickerStats("MU", {
      client: fakeClient({ quoteSummary: async () => ({ summaryDetail: { marketCap: 5 } }) }),
    });
    expect(ok.error).toBeNull();
    expect(ok.stats?.marketCap).toBe(5);

    const bad = await fetchTickerStats("MU", {
      client: fakeClient({ quoteSummary: async () => { throw new Error("summary boom"); } }),
    });
    expect(bad.stats).toBeNull();
    expect(bad.error).toMatch(/summary boom/);
  });

  it("fetchEarningsDates returns dates or [] + error", async () => {
    const ok = await fetchEarningsDates("MU", {
      client: fakeClient({ quoteSummary: async () => ({ calendarEvents: { earnings: { earningsDate: [D("2026-09-25")] } } }) }),
    });
    expect(ok.rows).toEqual([{ symbol: "MU", d: "2026-09-25", source: "yahoo2" }]);

    const bad = await fetchEarningsDates("MU", {
      client: fakeClient({ quoteSummary: async () => { throw new Error("cal boom"); } }),
    });
    expect(bad.rows).toEqual([]);
    expect(bad.error).toMatch(/cal boom/);
  });
});
