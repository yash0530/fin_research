import { describe, it, expect } from "vitest";
import {
  stooqUrl,
  parseStooqCsv,
  fetchStooqDaily,
  routeDailyBars,
  type Fetcher,
  type HttpResponse,
} from "./route";
import type { DailyBar, FetchResult } from "./yahoo2";

const noSleep = async (): Promise<void> => {};
const P1 = new Date("2020-01-01T00:00:00Z");

const bar = (d: string, close: number, source: string): DailyBar => ({ symbol: "MU", d, close, volume: null, source });

describe("stooqUrl", () => {
  it("lowercases the symbol and appends .us", () => {
    expect(stooqUrl("MU")).toBe("https://stooq.com/q/d/l/?s=mu.us&i=d");
  });
});

describe("parseStooqCsv", () => {
  it("parses Date/Close/Volume and tags source:stooq, skipping bad rows", () => {
    const csv = "Date,Open,High,Low,Close,Volume\n2024-01-02,10,11,9,10.5,1000\nbad,,,,,\n2024-01-03,,,,N/D,\n2024-01-04,11,12,10,11.25,2000";
    const rows = parseStooqCsv("mu", csv);
    expect(rows).toEqual([
      { symbol: "MU", d: "2024-01-02", close: 10.5, volume: 1000, source: "stooq" },
      { symbol: "MU", d: "2024-01-04", close: 11.25, volume: 2000, source: "stooq" },
    ]);
  });

  it("returns [] for an empty/headerless body", () => {
    expect(parseStooqCsv("X", "")).toEqual([]);
    expect(parseStooqCsv("X", "No data")).toEqual([]);
  });
});

describe("fetchStooqDaily", () => {
  it("fetches + parses; never throws", async () => {
    const fetchImpl: Fetcher = async () => ({ ok: true, status: 200, text: async () => "Date,Close\n2024-01-02,10.5" });
    const res = await fetchStooqDaily("MU", fetchImpl);
    expect(res.error).toBeNull();
    expect(res.rows[0]).toMatchObject({ d: "2024-01-02", close: 10.5, source: "stooq" });
  });

  it("returns [] + error on HTTP failure and on throw", async () => {
    const http500: Fetcher = async () => ({ ok: false, status: 500, text: async () => "" } as HttpResponse);
    expect((await fetchStooqDaily("MU", http500)).error).toMatch(/HTTP 500/);
    const boom: Fetcher = async () => { throw new Error("dns fail"); };
    expect((await fetchStooqDaily("MU", boom)).error).toMatch(/dns fail/);
  });
});

describe("routeDailyBars", () => {
  it("uses yahoo2 when it returns rows (no Stooq call)", async () => {
    let stooqCalled = false;
    const routed = await routeDailyBars("MU", P1, {
      yahoo2: async (): Promise<FetchResult<DailyBar>> => ({ rows: [bar("2024-01-02", 100, "yahoo2")], error: null }),
      stooq: async () => {
        stooqCalled = true;
        return { rows: [], error: null };
      },
      sleep: noSleep,
    });
    expect(routed.source).toBe("yahoo2");
    expect(routed.rows).toHaveLength(1);
    expect(stooqCalled).toBe(false);
  });

  it("falls back to Stooq (after a stagger) when yahoo2 is empty, filtering to period1", async () => {
    let slept = 0;
    const routed = await routeDailyBars("MU", P1, {
      yahoo2: async () => ({ rows: [], error: "yahoo2 empty" }),
      stooq: async () => ({
        rows: [bar("2019-12-31", 9, "stooq"), bar("2020-06-01", 12, "stooq")],
        error: null,
      }),
      staggerMs: 2000,
      sleep: async (ms) => {
        slept += ms;
      },
    });
    expect(slept).toBe(2000); // staggered before the Stooq hit
    expect(routed.source).toBe("stooq");
    expect(routed.rows.map((r) => r.d)).toEqual(["2020-06-01"]); // pre-period1 row filtered out
  });

  it("returns null source + combined error when both providers are empty", async () => {
    const routed = await routeDailyBars("MU", P1, {
      yahoo2: async () => ({ rows: [], error: "yahoo2 empty" }),
      stooq: async () => ({ rows: [], error: "stooq empty" }),
      sleep: noSleep,
    });
    expect(routed.source).toBeNull();
    expect(routed.rows).toEqual([]);
    expect(routed.error).toMatch(/yahoo2 empty; stooq empty/);
  });

  it("without a Stooq fallback, an empty yahoo2 result yields no rows", async () => {
    const routed = await routeDailyBars("MU", P1, {
      yahoo2: async () => ({ rows: [], error: "yahoo2 empty" }),
    });
    expect(routed.rows).toEqual([]);
    expect(routed.error).toMatch(/yahoo2 empty/);
  });
});
