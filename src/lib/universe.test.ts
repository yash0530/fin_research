import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { parseUniverseCsv, countByGics, summarizeUniverse } from "./universe";

describe("parseUniverseCsv", () => {
  it("maps GICS sector names to g_* codes", () => {
    const csv = [
      "ticker,company,sector,industry",
      "MU,Micron Technology,Information Technology,Semiconductors",
      "JPM,JPMorgan Chase,Financials,Banks",
      "XOM,Exxon Mobil,Energy,Oil & Gas",
    ].join("\n");
    const rows = parseUniverseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ symbol: "MU", gicsCode: "g_info_tech" });
    expect(rows[1].gicsCode).toBe("g_financials");
    expect(rows[2].gicsCode).toBe("g_energy");
  });

  it("handles quoted fields with embedded commas", () => {
    const csv = 'ticker,company,sector\nBRK.B,"Berkshire Hathaway, Inc.",Financials';
    const rows = parseUniverseCsv(csv);
    expect(rows[0].name).toBe("Berkshire Hathaway, Inc.");
    expect(rows[0].symbol).toBe("BRK.B");
  });

  it("marks an unknown sector name as unmapped (null)", () => {
    const rows = parseUniverseCsv("ticker,company,sector\nZZZ,Zeta,Unknownia");
    expect(rows[0].gicsCode).toBeNull();
  });

  it("returns empty for headerless/blank input", () => {
    expect(parseUniverseCsv("")).toEqual([]);
    expect(parseUniverseCsv("just one line")).toEqual([]);
  });

  it("counts constituents per GICS code", () => {
    const csv = [
      "ticker,company,sector",
      "MU,Micron,Information Technology",
      "NVDA,Nvidia,Information Technology",
      "JPM,JPMorgan,Financials",
      "ZZZ,Zeta,Unknownia",
    ].join("\n");
    const counts = countByGics(parseUniverseCsv(csv));
    expect(counts.g_info_tech).toBe(2);
    expect(counts.g_financials).toBe(1);
    expect(counts.unmapped).toBe(1);
  });

  it("summarizes mapped/unmapped/sector counts", () => {
    const csv = [
      "ticker,company,sector",
      "MU,Micron,Information Technology",
      "JPM,JPMorgan,Financials",
      "ZZZ,Zeta,Unknownia",
    ].join("\n");
    const s = summarizeUniverse(parseUniverseCsv(csv));
    expect(s.total).toBe(3);
    expect(s.mapped).toBe(2);
    expect(s.unmapped).toBe(1);
    expect(s.sectors).toBe(2);
  });
});

describe("config/sp500.csv integrity", () => {
  it("parses the full donor universe with every row GICS-mapped", () => {
    const path = "config/sp500.csv";
    if (!existsSync(path)) throw new Error("config/sp500.csv missing — copy the donor CSV");
    const rows = parseUniverseCsv(readFileSync(path, "utf8"));
    const s = summarizeUniverse(rows);
    expect(s.total).toBeGreaterThanOrEqual(500); // full S&P universe
    expect(s.unmapped).toBe(0); // every S&P sector name maps to a g_* code
    expect(s.sectors).toBe(11); // all 11 GICS sectors present
    // Header columns preserved (ticker/company_name/sector/industry).
    const mu = rows.find((r) => r.symbol === "MU");
    expect(mu?.gicsCode).toBe("g_info_tech");
  });
});
