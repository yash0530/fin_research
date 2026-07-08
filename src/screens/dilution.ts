import { FundamentalsQuarter } from "./types";
import { quartersWith } from "./merge-quarters";

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
  const warnings: string[] = [];

  // Freshest quarters that actually report a share count — the newest calendar
  // quarter often lacks sharesOut until its 10-Q lands, which would otherwise void
  // the whole 3-year comparison (see quartersWith / ev.ts freshest-window logic).
  const withShares = quartersWith(quarters, ["sharesOut"]);
  if (withShares.length < 13) {
    return {
      value: null,
      verdict: "unknown",
      warnings: [`Insufficient quarters reporting share count for a 3-year dilution comparison (need 13, have ${withShares.length})`],
    };
  }

  const latest = withShares[withShares.length - 1];
  const prior = withShares[withShares.length - 13];

  const latestShares = latest.sharesOut;
  const priorShares = prior.sharesOut;

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
