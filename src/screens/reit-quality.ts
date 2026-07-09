import { FundamentalsQuarter } from "./types";
import { quartersWith } from "./merge-quarters";

export type ReitVerdict = "cheap" | "fair" | "rich" | "unknown";

export type ReitQualityResult = {
  ffoTtm: number | null;
  ffoPerShare: number | null;
  ffoPayout: null; // Omitted as dividend field doesn't exist
  pFfo: number | null;
  verdict: ReitVerdict;
  warnings: string[];
};

export function screenApplicability(sectorCodes: string[]): { applicable: boolean; reason?: string } {
  if (sectorCodes.includes("g_real_estate")) {
    return { applicable: true };
  }
  return { applicable: false, reason: "Applicable only to GICS Real Estate (g_real_estate)" };
}

export function computeReitQuality(quarters: FundamentalsQuarter[], marketCap: number | null): ReitQualityResult {
  const sorted = [...quarters].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const warnings: string[] = [];

  // 1. Filter quarters with required fields: netIncome and depreciation
  const completeQuarters = quartersWith(sorted, ["netIncome", "depreciation"]);
  const hasTtm = completeQuarters.length >= 4;

  // Add warning about ffoPayout omitting due to lack of dividend field
  warnings.push("Dividend field is not available in FundamentalsQuarter, so ffoPayout is omitted.");

  if (!hasTtm) {
    warnings.push(`Insufficient quarters reporting Net Income + Depreciation for a TTM period (need 4, have ${completeQuarters.length})`);
    return {
      ffoTtm: null,
      ffoPerShare: null,
      ffoPayout: null,
      pFfo: null,
      verdict: "unknown",
      warnings,
    };
  }

  const ttmQuarters = completeQuarters.slice(-4);

  // 2. Compute FFO TTM = Sum of (Net Income + Depreciation)
  let ffoTtm = 0;
  for (const q of ttmQuarters) {
    ffoTtm += (q.netIncome as number) + (q.depreciation as number);
  }

  // 3. Compute FFO per share (using latest available sharesOut in the TTM window)
  let ffoPerShare: number | null = null;
  const latestQuarter = ttmQuarters[ttmQuarters.length - 1];
  if (latestQuarter.sharesOut !== null && latestQuarter.sharesOut !== undefined && latestQuarter.sharesOut > 0) {
    ffoPerShare = ffoTtm / latestQuarter.sharesOut;
  } else {
    warnings.push("ffoPerShare: Latest quarter in the TTM window is missing sharesOut or it is non-positive.");
  }

  // 4. Compute P/FFO (marketCap / ffoTtm) and verdict
  let pFfo: number | null = null;
  let verdict: ReitVerdict = "unknown";

  if (ffoTtm < 0) {
    warnings.push("FFO is negative, valuation is suspended.");
    verdict = "unknown";
  } else if (marketCap === null || marketCap === undefined || marketCap <= 0) {
    warnings.push("marketCap is missing or non-positive, cannot compute P/FFO.");
    verdict = "unknown";
  } else {
    pFfo = marketCap / ffoTtm;
    
    // Cheapness thresholds:
    // P/FFO < 15: cheap
    // P/FFO 15-22: fair
    // P/FFO > 22: rich
    if (pFfo < 15) {
      verdict = "cheap";
    } else if (pFfo >= 15 && pFfo <= 22) {
      verdict = "fair";
    } else {
      verdict = "rich";
    }
  }

  return {
    ffoTtm,
    ffoPerShare,
    ffoPayout: null,
    pFfo,
    verdict,
    warnings,
  };
}
