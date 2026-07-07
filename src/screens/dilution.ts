import { FundamentalsQuarter } from "./types";

export type DilutionVerdict = "pass" | "fail" | "unknown";

export type DilutionResult = {
  value: number | null; // percentage change
  verdict: DilutionVerdict;
  warnings: string[];
};

export function screenApplicability(sectorCodes: string[]): { applicable: boolean; reason?: string } {
  if (sectorCodes.includes("g_financials") || sectorCodes.includes("g_real_estate")) {
    return { applicable: false, reason: "Financials/REITs are excluded from this screen" };
  }
  return { applicable: true };
}

export function computeDilution(quarters: FundamentalsQuarter[]): DilutionResult {
  const sorted = [...quarters].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const warnings: string[] = [];

  // To compute a 12-quarter change, we need at least 13 quarters of data
  // so we can compare index n-1 with index n-13 (which is n - 1 - 12)
  if (sorted.length < 13) {
    return {
      value: null,
      verdict: "unknown",
      warnings: [`Insufficient quarters for 3-year dilution calculation (need 13, have ${sorted.length})`],
    };
  }

  const latest = sorted[sorted.length - 1];
  const prior = sorted[sorted.length - 13];

  const latestShares = latest.sharesOut;
  const priorShares = prior.sharesOut;

  if (latestShares === null || latestShares === undefined) {
    warnings.push(`Dilution: sharesOut is missing for latest period ${latest.periodEnd}`);
  }
  if (priorShares === null || priorShares === undefined) {
    warnings.push(`Dilution: sharesOut is missing for prior period ${prior.periodEnd}`);
  }

  if (latestShares === null || latestShares === undefined || priorShares === null || priorShares === undefined) {
    return {
      value: null,
      verdict: "unknown",
      warnings,
    };
  }

  if (priorShares <= 0) {
    warnings.push(`Dilution: sharesOut for prior period ${prior.periodEnd} is non-positive (${priorShares})`);
    return {
      value: null,
      verdict: "unknown",
      warnings,
    };
  }

  const changePct = ((latestShares - priorShares) / priorShares) * 100;
  const verdict = changePct <= 0 ? "pass" : "fail";

  return {
    value: changePct,
    verdict,
    warnings,
  };
}
