import { FundamentalsQuarter } from "./types";

export type AccrualsVerdict = "pass" | "warn" | "fail" | "unknown";

export type AccrualsResult = {
  value: number | null;
  verdict: AccrualsVerdict;
  warnings: string[];
};

export function screenApplicability(sectorCodes: string[]): { applicable: boolean; reason?: string } {
  if (sectorCodes.includes("g_financials") || sectorCodes.includes("g_real_estate")) {
    return { applicable: false, reason: "Financials/REITs are excluded from this screen" };
  }
  return { applicable: true };
}

export function computeAccruals(quarters: FundamentalsQuarter[]): AccrualsResult {
  const sorted = [...quarters].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const warnings: string[] = [];

  if (sorted.length < 4) {
    return {
      value: null,
      verdict: "unknown",
      warnings: [`Insufficient quarters for TTM period (need 4, have ${sorted.length})`],
    };
  }

  const ttmQuarters = sorted.slice(-4);

  let netIncomeSum = 0;
  let cfoSum = 0;
  let assetsSum = 0;
  let missingNetIncome = false;
  let missingCfo = false;
  let missingAssets = false;

  for (const q of ttmQuarters) {
    if (q.netIncome === null || q.netIncome === undefined) {
      missingNetIncome = true;
    } else {
      netIncomeSum += q.netIncome;
    }

    if (q.cfo === null || q.cfo === undefined) {
      missingCfo = true;
    } else {
      cfoSum += q.cfo;
    }

    if (q.totalAssets === null || q.totalAssets === undefined) {
      missingAssets = true;
    } else {
      assetsSum += q.totalAssets;
    }
  }

  if (missingNetIncome) {
    warnings.push("Sloan: TTM Net Income has missing quarters");
  }
  if (missingCfo) {
    warnings.push("Sloan: TTM CFO has missing quarters");
  }
  if (missingAssets) {
    warnings.push("Sloan: TTM Total Assets has missing quarters");
  }

  if (missingNetIncome || missingCfo || missingAssets) {
    return {
      value: null,
      verdict: "unknown",
      warnings,
    };
  }

  const avgAssets = assetsSum / 4;
  if (avgAssets <= 0) {
    warnings.push("Sloan: Average Total Assets is non-positive");
    return {
      value: null,
      verdict: "unknown",
      warnings,
    };
  }

  const value = (netIncomeSum - cfoSum) / avgAssets;

  let verdict: AccrualsVerdict = "unknown";
  if (value < 0) {
    verdict = "pass";
  } else if (value >= 0 && value <= 0.10) {
    verdict = "warn";
  } else if (value > 0.10) {
    verdict = "fail";
  }

  return {
    value,
    verdict,
    warnings,
  };
}
