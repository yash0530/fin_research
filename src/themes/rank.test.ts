import { describe, it, expect } from "vitest";
import { rankTheme, themeIntelligence, twelveMinusOneReturn, type RankInput } from "./rank";
import { THEMES, getTheme, themeForSector, themeSectorCodes } from "./taxonomy";
import type { FundamentalsQuarter } from "../screens/types";

const mkQuarter = (periodEnd: string, overrides: Partial<FundamentalsQuarter> = {}): FundamentalsQuarter => ({
  symbol: "TEST",
  periodEnd,
  revenue: 1000,
  grossProfit: 600,
  operatingIncome: 200,
  netIncome: 100,
  fcf: 80,
  capex: 20,
  totalAssets: 5000,
  totalDebt: 1000,
  cash: 500,
  equity: 4000,
  sharesOut: 100,
  cfo: 150,
  sga: 300,
  depreciation: 50,
  receivables: 200,
  currentAssets: 1500,
  currentLiabilities: 1000,
  retainedEarnings: 1000,
  ppe: 2000,
  ...overrides,
});

const mkQuarters = (count: number): FundamentalsQuarter[] => {
  const quarters: FundamentalsQuarter[] = [];
  for (let i = 0; i < count; i++) {
    const year = 2020 + Math.floor(i / 4);
    const q = (i % 4) + 1;
    const month = q === 1 ? "03" : q === 2 ? "06" : q === 3 ? "09" : "12";
    quarters.push(mkQuarter(`${year}-${month}-31`));
  }
  return quarters;
};

/** ~300 daily closes ending flat, with a chosen 12-1 return baked in. */
const mkCloses = (ret121: number): number[] => {
  const closes = new Array(300).fill(0);
  const startIdx = 300 - 1 - 252; // 12m ago
  const endIdx = 300 - 1 - 21; // 1m ago
  for (let i = 0; i < 300; i++) closes[i] = 100;
  closes[startIdx] = 100;
  closes[endIdx] = 100 * (1 + ret121);
  return closes;
};

const mkInput = (symbol: string, overrides: Partial<RankInput> = {}): RankInput => ({
  symbol,
  sectorCode: "g_info_tech",
  quarters: mkQuarters(12),
  closes: mkCloses(0.1),
  marketCap: 10_000,
  evToEbit: 15,
  ...overrides,
});

describe("taxonomy", () => {
  it("ships the AI theme with 12 subthemes mapped 1:1 onto ai_* sectors", () => {
    const ai = getTheme("ai");
    expect(ai).toBeDefined();
    expect(ai!.subthemes.length).toBe(12);
    expect(themeSectorCodes("ai")).toContain("ai_memory");
    expect(THEMES.every((t) => t.subthemes.every((s) => s.sectorCodes.length > 0))).toBe(true);
  });

  it("reverse-maps a sector to its theme/subtheme", () => {
    const hit = themeForSector("ai_memory");
    expect(hit?.theme.code).toBe("ai");
    expect(hit?.subtheme.code).toBe("ai_memory");
    expect(themeForSector("g_energy")).toBeNull();
  });
});

describe("twelveMinusOneReturn", () => {
  it("computes the 12m return skipping the last month", () => {
    expect(twelveMinusOneReturn(mkCloses(0.25))!).toBeCloseTo(0.25, 6);
  });

  it("returns null on insufficient history", () => {
    expect(twelveMinusOneReturn(new Array(100).fill(100))).toBeNull();
  });
});

describe("rankTheme", () => {
  it("ranks names with all three segments and honest competition ranking", () => {
    const inputs = [
      mkInput("AAA", { evToEbit: 8, closes: mkCloses(0.4) }),
      mkInput("BBB", { evToEbit: 20, closes: mkCloses(0.0) }),
      mkInput("CCC", { evToEbit: 30, closes: mkCloses(-0.2) }),
    ];
    const res = rankTheme(inputs);
    expect(res.ranked.length).toBe(3);
    expect(res.silo.length).toBe(0);
    expect(res.ranked[0].symbol).toBe("AAA");
    expect(res.ranked[0].rank).toBe(1);
    // every ranked row exposes all three segments + provenance
    for (const row of res.ranked) {
      expect(row.segments.quality).not.toBeNull();
      expect(row.segments.valuation).not.toBeNull();
      expect(row.segments.momentum).not.toBeNull();
      expect(row.subScores.valuation).toContain("EV/EBIT");
      expect(row.composite).not.toBeNull();
    }
  });

  it("marks ties with a shared rank and tied flags (1,2,2,4 style)", () => {
    // identical inputs → identical composites → tie
    const inputs = [
      mkInput("AAA", { evToEbit: 8, closes: mkCloses(0.4) }),
      mkInput("TIE1", { evToEbit: 15, closes: mkCloses(0.1) }),
      mkInput("TIE2", { evToEbit: 15, closes: mkCloses(0.1) }),
    ];
    const res = rankTheme(inputs);
    const t1 = res.ranked.find((r) => r.symbol === "TIE1")!;
    const t2 = res.ranked.find((r) => r.symbol === "TIE2")!;
    expect(t1.composite).toBe(t2.composite);
    expect(t1.rank).toBe(t2.rank);
    expect(t1.tied).toBe(true);
    expect(t2.tied).toBe(true);
  });

  it("silos names missing >1 segment instead of ranking them last", () => {
    const inputs = [
      mkInput("GOOD"),
      mkInput("BAD", { quarters: [], closes: [], evToEbit: null, marketCap: null }),
    ];
    const res = rankTheme(inputs);
    expect(res.ranked.map((r) => r.symbol)).toEqual(["GOOD"]);
    expect(res.silo.length).toBe(1);
    expect(res.silo[0].symbol).toBe("BAD");
    expect(res.silo[0].insufficientData).toBe(true);
    expect(res.silo[0].rank).toBeNull();
    expect(res.silo[0].missing.length).toBeGreaterThan(1);
  });

  it("falls back to P/S when EV/EBIT is suspended and says so", () => {
    const inputs = [
      mkInput("NEG", { evToEbit: null }), // suspended multiple, P/S = 10000/4000 = 2.5
      mkInput("PEER1", { evToEbit: null, marketCap: 20_000 }),
      mkInput("PEER2", { evToEbit: null, marketCap: 40_000 }),
    ];
    const res = rankTheme(inputs);
    const neg = [...res.ranked, ...res.silo].find((r) => r.symbol === "NEG")!;
    expect(neg.segments.valuation).not.toBeNull();
    expect(neg.subScores.valuation).toContain("P/S");
    expect(neg.warnings.some((w) => w.includes("P/S fallback"))).toBe(true);
  });

  it("excludes financials from quality but keeps valuation/momentum", () => {
    const inputs = [
      mkInput("BANK", { sectorCode: "g_financials" }),
      mkInput("BANK2", { sectorCode: "g_financials", evToEbit: 25 }),
      mkInput("TECH"),
    ];
    const res = rankTheme(inputs);
    const bank = [...res.ranked, ...res.silo].find((r) => r.symbol === "BANK")!;
    expect(bank.segments.quality).toBeNull();
    expect(bank.missing.some((m) => m.startsWith("quality"))).toBe(true);
    expect(bank.passesQualityGates).toBe(false);
    // still rankable on the other two segments
    expect(bank.insufficientData).toBe(false);
  });

  it("warns when a sector cohort has <10 names", () => {
    const res = rankTheme([mkInput("AAA"), mkInput("BBB")]);
    expect(res.warnings.some((w) => w.includes("<10 names"))).toBe(true);
  });

  it("neutralizes momentum by sector median", () => {
    // Sector A: both up 30% → zero excess. Sector B: flat name → zero excess too.
    // A cross-sector high-flyer only wins via excess over ITS OWN sector median.
    const inputs = [
      mkInput("A1", { sectorCode: "g_energy", closes: mkCloses(0.3) }),
      mkInput("A2", { sectorCode: "g_energy", closes: mkCloses(0.3) }),
      mkInput("B1", { sectorCode: "g_utilities", closes: mkCloses(0.0) }),
      mkInput("B2", { sectorCode: "g_utilities", closes: mkCloses(0.0) }),
      mkInput("B3", { sectorCode: "g_utilities", closes: mkCloses(0.5) }),
    ];
    const res = rankTheme(inputs);
    const b3 = res.ranked.find((r) => r.symbol === "B3")!;
    const a1 = res.ranked.find((r) => r.symbol === "A1")!;
    // B3 has +50pp excess over its sector median; A1 has 0pp — B3 must out-rank A1 on momentum
    expect(b3.segments.momentum!).toBeGreaterThan(a1.segments.momentum!);
  });
});

describe("themeIntelligence", () => {
  it("aggregates valuation percentile, breadth, and silo count", () => {
    const res = rankTheme([
      mkInput("AAA", { evToEbit: 8 }),
      mkInput("BBB", { evToEbit: 20 }),
      mkInput("BAD", { quarters: [], closes: [], evToEbit: null, marketCap: null }),
    ]);
    const intel = themeIntelligence(res);
    expect(intel.rankedCount).toBe(2);
    expect(intel.siloCount).toBe(1);
    expect(intel.aggregateValuationPctile).not.toBeNull();
    expect(intel.breadth).not.toBeNull();
  });
});
