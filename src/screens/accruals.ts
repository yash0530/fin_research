import { FundamentalsQuarter } from "./types";
import { quartersWith } from "./merge-quarters";

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
  const warnings: string[] = [];

  // Freshest 4 quarters that actually report all three inputs (see quartersWith):
  // a strict last-4 window is voided by the newest quarter's un-filed cash flow.
  const complete = quartersWith(quarters, ["netIncome", "cfo", "totalAssets"]);
  if (complete.length < 4) {
    return {
      value: null,
      verdict: "unknown",
      warnings: [`Insufficient quarters reporting Net Income + CFO + Total Assets for a TTM period (need 4, have ${complete.length})`],
    };
  }

  const ttmQuarters = complete.slice(-4);
  const newest = quarters.reduce((m, q) => (q.periodEnd > m ? q.periodEnd : m), "");
  if (ttmQuarters[ttmQuarters.length - 1].periodEnd < newest) {
    warnings.push(`Sloan: TTM window ends ${ttmQuarters[ttmQuarters.length - 1].periodEnd} (latest quarter ${newest} has not yet reported cash flow)`);
  }

  let netIncomeSum = 0;
  let cfoSum = 0;
  let assetsSum = 0;
  for (const q of ttmQuarters) {
    netIncomeSum += q.netIncome as number;
    cfoSum += q.cfo as number;
    assetsSum += q.totalAssets as number;
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
