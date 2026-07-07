import { FundamentalsQuarter } from "./types";

export type TestResult = "pass" | "fail" | "unknown";

export type FScoreTest = {
  name: string;
  result: TestResult;
};

export type FScoreResult = {
  score: number;
  maxComputable: number;
  tests: FScoreTest[];
  warnings: string[];
};

export function screenApplicability(sectorCodes: string[]): { applicable: boolean; reason?: string } {
  if (sectorCodes.includes("g_financials") || sectorCodes.includes("g_real_estate")) {
    return { applicable: false, reason: "Financials/REITs are excluded from this screen" };
  }
  return { applicable: true };
}

function sumFlowMetric(quarters: FundamentalsQuarter[], key: keyof FundamentalsQuarter): number | null {
  if (quarters.length === 0) return null;
  let sum = 0;
  for (const q of quarters) {
    const val = q[key];
    if (val === null || val === undefined) return null;
    sum += val as number;
  }
  return sum;
}

function getSnapshotMetric(quarters: FundamentalsQuarter[], key: keyof FundamentalsQuarter): number | null {
  if (quarters.length === 0) return null;
  const val = quarters[quarters.length - 1][key];
  if (val === null || val === undefined) return null;
  return val as number;
}

export function computeFScore(quarters: FundamentalsQuarter[]): FScoreResult {
  const sorted = [...quarters].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const warnings: string[] = [];
  const tests: FScoreTest[] = [];

  const hasTtm = sorted.length >= 4;
  const hasPrior = sorted.length >= 8;

  if (!hasTtm) {
    warnings.push(`Insufficient quarters for TTM period (need 4, have ${sorted.length})`);
  }
  if (hasTtm && !hasPrior) {
    warnings.push(`Insufficient quarters for prior TTM period (need 8, have ${sorted.length})`);
  }

  const ttmQuarters = hasTtm ? sorted.slice(-4) : [];
  const priorQuarters = hasPrior ? sorted.slice(-8, -4) : [];

  // TTM metrics
  const T_NI = sumFlowMetric(ttmQuarters, "netIncome");
  const T_CFO = sumFlowMetric(ttmQuarters, "cfo");
  const T_REV = sumFlowMetric(ttmQuarters, "revenue");
  const T_GP = sumFlowMetric(ttmQuarters, "grossProfit");
  const T_Asset = getSnapshotMetric(ttmQuarters, "totalAssets");
  const T_Debt = getSnapshotMetric(ttmQuarters, "totalDebt");
  const T_CurrAsset = getSnapshotMetric(ttmQuarters, "currentAssets");
  const T_CurrLiab = getSnapshotMetric(ttmQuarters, "currentLiabilities");
  const T_Shares = getSnapshotMetric(ttmQuarters, "sharesOut");

  // Prior TTM metrics
  const P_NI = sumFlowMetric(priorQuarters, "netIncome");
  const P_REV = sumFlowMetric(priorQuarters, "revenue");
  const P_GP = sumFlowMetric(priorQuarters, "grossProfit");
  const P_Asset = getSnapshotMetric(priorQuarters, "totalAssets");
  const P_Debt = getSnapshotMetric(priorQuarters, "totalDebt");
  const P_CurrAsset = getSnapshotMetric(priorQuarters, "currentAssets");
  const P_CurrLiab = getSnapshotMetric(priorQuarters, "currentLiabilities");
  const P_Shares = getSnapshotMetric(priorQuarters, "sharesOut");

  // 1. ROA
  if (T_NI === null || T_Asset === null) {
    tests.push({ name: "roa", result: "unknown" });
    warnings.push("roa: TTM Net Income or Ending Total Assets is missing");
  } else if (T_Asset <= 0) {
    tests.push({ name: "roa", result: "unknown" });
    warnings.push("roa: Ending Total Assets is non-positive");
  } else {
    tests.push({ name: "roa", result: (T_NI / T_Asset) > 0 ? "pass" : "fail" });
  }

  // 2. CFO
  if (T_CFO === null) {
    tests.push({ name: "cfo", result: "unknown" });
    warnings.push("cfo: TTM CFO is missing");
  } else {
    tests.push({ name: "cfo", result: T_CFO > 0 ? "pass" : "fail" });
  }

  // 3. ROA Trend
  if (T_NI === null || T_Asset === null || P_NI === null || P_Asset === null) {
    tests.push({ name: "roa_trend", result: "unknown" });
    warnings.push("roa_trend: TTM/Prior Net Income or Total Assets is missing");
  } else if (T_Asset <= 0 || P_Asset <= 0) {
    tests.push({ name: "roa_trend", result: "unknown" });
    warnings.push("roa_trend: TTM or Prior Total Assets is non-positive");
  } else {
    tests.push({ name: "roa_trend", result: (T_NI / T_Asset) > (P_NI / P_Asset) ? "pass" : "fail" });
  }

  // 4. Accrual
  if (T_CFO === null || T_NI === null) {
    tests.push({ name: "accrual", result: "unknown" });
    warnings.push("accrual: TTM CFO or Net Income is missing");
  } else {
    tests.push({ name: "accrual", result: T_CFO > T_NI ? "pass" : "fail" });
  }

  // 5. Leverage
  if (T_Debt === null || T_Asset === null || P_Debt === null || P_Asset === null) {
    tests.push({ name: "leverage", result: "unknown" });
    warnings.push("leverage: TTM/Prior Debt or Assets is missing");
  } else if (T_Asset <= 0 || P_Asset <= 0) {
    tests.push({ name: "leverage", result: "unknown" });
    warnings.push("leverage: TTM or Prior Total Assets is non-positive");
  } else {
    tests.push({ name: "leverage", result: (T_Debt / T_Asset) < (P_Debt / P_Asset) ? "pass" : "fail" });
  }

  // 6. Liquidity
  if (T_CurrAsset === null || T_CurrLiab === null || P_CurrAsset === null || P_CurrLiab === null) {
    tests.push({ name: "liquidity", result: "unknown" });
    warnings.push("liquidity: TTM/Prior Current Assets or Liabilities is missing");
  } else if (T_CurrLiab <= 0 || P_CurrLiab <= 0) {
    tests.push({ name: "liquidity", result: "unknown" });
    warnings.push("liquidity: TTM or Prior Current Liabilities is non-positive");
  } else {
    tests.push({ name: "liquidity", result: (T_CurrAsset / T_CurrLiab) > (P_CurrAsset / P_CurrLiab) ? "pass" : "fail" });
  }

  // 7. Dilution
  if (T_Shares === null || P_Shares === null) {
    tests.push({ name: "dilution", result: "unknown" });
    warnings.push("dilution: TTM/Prior Shares Outstanding is missing");
  } else if (T_Shares <= 0 || P_Shares <= 0) {
    tests.push({ name: "dilution", result: "unknown" });
    warnings.push("dilution: TTM or Prior Shares Outstanding is non-positive");
  } else {
    tests.push({ name: "dilution", result: T_Shares <= P_Shares ? "pass" : "fail" });
  }

  // 8. Gross Margin
  if (T_GP === null || T_REV === null || P_GP === null || P_REV === null) {
    tests.push({ name: "gross_margin", result: "unknown" });
    warnings.push("gross_margin: TTM/Prior Gross Profit or Revenue is missing");
  } else if (T_REV <= 0 || P_REV <= 0) {
    tests.push({ name: "gross_margin", result: "unknown" });
    warnings.push("gross_margin: TTM or Prior Revenue is non-positive");
  } else {
    tests.push({ name: "gross_margin", result: (T_GP / T_REV) > (P_GP / P_REV) ? "pass" : "fail" });
  }

  // 9. Asset Turnover
  if (T_REV === null || T_Asset === null || P_REV === null || P_Asset === null) {
    tests.push({ name: "asset_turnover", result: "unknown" });
    warnings.push("asset_turnover: TTM/Prior Revenue or Assets is missing");
  } else if (T_Asset <= 0 || P_Asset <= 0) {
    tests.push({ name: "asset_turnover", result: "unknown" });
    warnings.push("asset_turnover: TTM or Prior Total Assets is non-positive");
  } else {
    tests.push({ name: "asset_turnover", result: (T_REV / T_Asset) > (P_REV / P_Asset) ? "pass" : "fail" });
  }

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
    warnings,
  };
}
