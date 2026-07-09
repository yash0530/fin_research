import { FundamentalsQuarter } from "./types";
import { quartersWith } from "./merge-quarters";

export type TestResult = "pass" | "fail" | "unknown";

export type BankQualityTest = {
  name: string;
  result: TestResult;
};

export type BankQualityResult = {
  score: number;
  maxComputable: number;
  tests: BankQualityTest[];
  roa: number | null;
  roe: number | null;
  capitalRatio: number | null;
  efficiency: number | null;
  warnings: string[];
};

export function screenApplicability(sectorCodes: string[]): { applicable: boolean; reason?: string } {
  if (sectorCodes.includes("g_financials")) {
    return { applicable: true };
  }
  return { applicable: false, reason: "Applicable only to GICS Financials (g_financials)" };
}

export function computeBankQuality(quarters: FundamentalsQuarter[]): BankQualityResult {
  const sorted = [...quarters].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const warnings: string[] = [
    "This is a capital/return screen, not a true NIM/credit-quality model (v3)."
  ];
  const tests: BankQualityTest[] = [];

  // Freshest 4 complete quarters requiring netIncome and totalAssets
  const completeQuarters = quartersWith(sorted, ["netIncome", "totalAssets"]);
  const hasTtm = completeQuarters.length >= 4;

  if (!hasTtm) {
    warnings.push(`Insufficient quarters reporting Net Income + Total Assets for a TTM period (need 4, have ${completeQuarters.length})`);
    
    // Push all tests as unknown
    tests.push({ name: "roa", result: "unknown" });
    tests.push({ name: "roe", result: "unknown" });
    tests.push({ name: "capitalRatio", result: "unknown" });
    tests.push({ name: "efficiency", result: "unknown" });

    return {
      score: 0,
      maxComputable: 0,
      tests,
      roa: null,
      roe: null,
      capitalRatio: null,
      efficiency: null,
      warnings,
    };
  }

  const ttmQuarters = completeQuarters.slice(-4);

  // 1. ROA: TTM NI / avg totalAssets (banks ~≥1% = strong)
  let roa: number | null = null;
  let niSum = 0;
  let assetsSum = 0;
  for (const q of ttmQuarters) {
    niSum += q.netIncome as number;
    assetsSum += q.totalAssets as number;
  }
  const avgAssets = assetsSum / 4;
  if (avgAssets <= 0) {
    tests.push({ name: "roa", result: "unknown" });
    warnings.push("roa: Average Total Assets is non-positive");
  } else {
    roa = niSum / avgAssets;
    tests.push({ name: "roa", result: roa >= 0.01 ? "pass" : "fail" });
  }

  // 2. ROE: TTM NI / avg equity
  let roe: number | null = null;
  let missingEquity = false;
  let equitySum = 0;
  for (const q of ttmQuarters) {
    if (q.equity === null || q.equity === undefined) {
      missingEquity = true;
    } else {
      equitySum += q.equity;
    }
  }

  if (missingEquity) {
    tests.push({ name: "roe", result: "unknown" });
    warnings.push("roe: One or more quarters in the TTM window is missing Equity");
  } else {
    const avgEquity = equitySum / 4;
    if (avgEquity <= 0) {
      tests.push({ name: "roe", result: "unknown" });
      warnings.push("roe: Average Equity is non-positive");
    } else {
      roe = niSum / avgEquity;
      tests.push({ name: "roe", result: roe >= 0.10 ? "pass" : "fail" }); // ~10% standard
    }
  }

  // 3. Capital Ratio: equity / totalAssets (higher = safer, benchmark ~8%)
  let capitalRatio: number | null = null;
  const latest = ttmQuarters[ttmQuarters.length - 1];
  if (latest.equity === null || latest.equity === undefined || latest.totalAssets === null || latest.totalAssets === undefined) {
    tests.push({ name: "capitalRatio", result: "unknown" });
    warnings.push("capitalRatio: Ending Equity or Total Assets is missing");
  } else if (latest.totalAssets <= 0) {
    tests.push({ name: "capitalRatio", result: "unknown" });
    warnings.push("capitalRatio: Ending Total Assets is non-positive");
  } else {
    capitalRatio = latest.equity / latest.totalAssets;
    tests.push({ name: "capitalRatio", result: capitalRatio >= 0.08 ? "pass" : "fail" }); // ~8% benchmark
  }

  // 4. Efficiency Proxy: sga / revenue (lower = better, benchmark <= 60%)
  let efficiency: number | null = null;
  let missingSgaOrRev = false;
  let sgaSum = 0;
  let revSum = 0;
  for (const q of ttmQuarters) {
    if (q.sga === null || q.sga === undefined || q.revenue === null || q.revenue === undefined) {
      missingSgaOrRev = true;
    } else {
      sgaSum += q.sga;
      revSum += q.revenue;
    }
  }

  if (missingSgaOrRev) {
    tests.push({ name: "efficiency", result: "unknown" });
    warnings.push("efficiency: One or more quarters in the TTM window is missing SGA or Revenue");
  } else if (revSum <= 0) {
    tests.push({ name: "efficiency", result: "unknown" });
    warnings.push("efficiency: TTM Revenue is non-positive");
  } else {
    efficiency = sgaSum / revSum;
    tests.push({ name: "efficiency", result: efficiency <= 0.60 ? "pass" : "fail" }); // <=60% benchmark
  }

  // Calculate score and maxComputable
  let score = 0;
  let maxComputable = 0;
  for (const t of tests) {
    if (t.result === "pass") {
      score += 1;
      maxComputable += 1;
    } else if (t.result === "fail") {
      maxComputable += 1;
    }
  }

  return {
    score,
    maxComputable,
    tests,
    roa,
    roe,
    capitalRatio,
    efficiency,
    warnings,
  };
}
