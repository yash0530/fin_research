import { describe, it, expect } from "vitest";
import { fetchChart, fetchSubmissions, type Fetcher } from "./fetchers";
import { RateLimiter } from "./rate-limiter";

const noSleep = async (): Promise<void> => {};

describe("fetchChart", () => {
  it("builds the chart URL and parses closes", async () => {
    let calledUrl = "";
    const fetchImpl: Fetcher = async (url) => {
      calledUrl = url;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ chart: { result: [{ timestamp: [1704067200], indicators: { quote: [{ close: [100.5] }] } }] } }),
      };
    };
    const rows = await fetchChart("MU", fetchImpl, { range: "10y" });
    expect(calledUrl).toContain("/chart/MU");
    expect(calledUrl).toContain("range=10y");
    expect(rows).toEqual([{ symbol: "MU", d: "2024-01-01", close: 100.5 }]);
  });

  it("throws on a non-2xx response", async () => {
    const fetchImpl: Fetcher = async () => ({ ok: false, status: 429, text: async () => "rate limited" });
    await expect(fetchChart("MU", fetchImpl)).rejects.toThrow(/HTTP 429/);
  });
});

describe("fetchSubmissions", () => {
  it("pads the CIK, sends a User-Agent, throttles, and parses filings", async () => {
    let sentHeaders: Record<string, string> | undefined;
    let calledUrl = "";
    const fetchImpl: Fetcher = async (url, init) => {
      calledUrl = url;
      sentHeaders = init?.headers;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            filings: { recent: { accessionNumber: ["a1"], form: ["10-K"], filingDate: ["2024-02-01"], primaryDocument: ["mu.htm"] } },
          }),
      };
    };
    const rows = await fetchSubmissions("723125", "MU", fetchImpl, "Yash y@e.com", new RateLimiter(8, () => 0), noSleep);
    expect(calledUrl).toBe("https://data.sec.gov/submissions/CIK0000723125.json");
    expect(sentHeaders?.["User-Agent"]).toBe("Yash y@e.com");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ form: "10-K", cik: "0000723125", symbol: "MU" });
  });
});
