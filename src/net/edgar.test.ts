import { describe, it, expect } from "vitest";
import { RateLimiter } from "./rate-limiter";
import { requireUserAgent, parseSubmissions, EDGAR_LIMITER } from "./edgar";

describe("RateLimiter", () => {
  it("spaces grants by 1000/rate ms (8 req/s → 125ms)", () => {
    const rl = new RateLimiter(8, () => 0);
    expect(rl.intervalMs).toBe(125);
    expect(rl.reserve(0)).toBe(0);
    expect(rl.reserve(0)).toBe(125);
    expect(rl.reserve(0)).toBe(250);
  });

  it("never exceeds the rate under parallel load (16 callers at t=0)", () => {
    const rl = new RateLimiter(8, () => 0);
    const grantTimes = Array.from({ length: 16 }, () => 0 + rl.reserve(0));
    // Each grant is >=125ms after the previous → at most 8 in any rolling 1000ms.
    for (let i = 1; i < grantTimes.length; i++) {
      expect(grantTimes[i] - grantTimes[i - 1]).toBeGreaterThanOrEqual(125);
    }
    const inFirstSecond = grantTimes.filter((t) => t < 1000).length;
    expect(inFirstSecond).toBeLessThanOrEqual(8);
  });

  it("does not make you wait after an idle period", () => {
    const rl = new RateLimiter(8, () => 0);
    rl.reserve(0); // nextFree → 125
    expect(rl.reserve(1000)).toBe(0); // long after the slot freed
  });

  it("throttle waits then runs", async () => {
    const rl = new RateLimiter(4, () => 0);
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    await rl.throttle(async () => "a", sleep);
    await rl.throttle(async () => "b", sleep);
    expect(waits).toEqual([250]); // 2nd call waits 1000/4 = 250ms
  });
});

describe("EDGAR helpers", () => {
  it("requireUserAgent enforces a descriptive UA", () => {
    expect(() => requireUserAgent({})).toThrow(/EDGAR_USER_AGENT is required/);
    expect(requireUserAgent({ EDGAR_USER_AGENT: "  Yash y@e.com " })).toBe("Yash y@e.com");
  });

  it("the shared EDGAR limiter is 8 req/s", () => {
    expect(EDGAR_LIMITER.intervalMs).toBe(125);
  });

  it("parseSubmissions keeps only forms of interest with correct fields", () => {
    const json = {
      filings: {
        recent: {
          accessionNumber: ["0001-24-01", "0001-24-02", "0001-24-03"],
          form: ["10-K", "S-1", "8-K"],
          filingDate: ["2024-02-01", "2024-03-01", "2024-04-01"],
          primaryDocument: ["mu-10k.htm", "s1.htm", "mu-8k.htm"],
        },
      },
    };
    const rows = parseSubmissions("0000723125", "MU", json);
    expect(rows.map((r) => r.form)).toEqual(["10-K", "8-K"]); // S-1 dropped
    expect(rows[0]).toMatchObject({
      accessionNo: "0001-24-01",
      symbol: "MU",
      cik: "0000723125",
      filedAt: "2024-02-01",
      primaryDoc: "mu-10k.htm",
    });
  });

  it("returns empty when there are no recent filings", () => {
    expect(parseSubmissions("0", "X", {})).toEqual([]);
  });
});
