import { FundamentalsQuarter } from "./types";

export type EarningsTrendVerdict =
  | "deteriorating"
  | "improvingUnconfirmed"
  | "improvingConfirmed"
  | "flat"
  | "unknown";

export type EarningsTrendResult = {
  zScore: number | null;
  expectedEps: number | null;
  actualEps: number | null;
  sigma: number | null;
  verdict: EarningsTrendVerdict;
  warnings: string[];
};

export function screenApplicability(sectorCodes: string[]): { applicable: boolean; reason?: string } {
  if (sectorCodes.includes("g_financials") || sectorCodes.includes("g_real_estate")) {
    return { applicable: false, reason: "Financials/REITs are excluded from this screen" };
  }
  return { applicable: true };
}

export function computeEarningsTrend(
  quarters: FundamentalsQuarter[],
  postReactionExcessReturn?: number | null
): EarningsTrendResult {
  const sorted = [...quarters].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const warnings: string[] = [];
  const N = sorted.length;

  // We need at least 25 quarters to calculate z-score (24 lookback + 1 current)
  if (N < 25) {
    return {
      zScore: null,
      expectedEps: null,
      actualEps: null,
      sigma: null,
      verdict: "unknown",
      warnings: [`Insufficient quarters for YoY earnings trend calculation (need 25, have ${N})`],
    };
  }

  // Calculate EPS for all quarters: EPS = Net Income / Shares Outstanding
  const eps: (number | null)[] = sorted.map((q) => {
    if (q.netIncome === null || q.netIncome === undefined) return null;
    if (q.sharesOut === null || q.sharesOut === undefined || q.sharesOut <= 0) return null;
    return q.netIncome / q.sharesOut;
  });

  // Calculate seasonal differences: diff_t = EPS_t - EPS_{t-4}
  const diff: (number | null)[] = Array(N).fill(null);
  for (let i = 4; i < N; i++) {
    const currentEps = eps[i];
    const priorEps = eps[i - 4];
    if (currentEps !== null && priorEps !== null) {
      diff[i] = currentEps - priorEps;
    }
  }

  // Helper to compute expected EPS: expected_t = EPS_{t-4} + mean(last 8 diffs starting from t-1)
  function getExpectedEps(index: number): number | null {
    const epsYearAgo = eps[index - 4];
    if (epsYearAgo === null) return null;

    let diffSum = 0;
    for (let j = 1; j <= 8; j++) {
      const d = diff[index - j];
      if (d === null) return null;
      diffSum += d;
    }
    return epsYearAgo + diffSum / 8;
  }

  // Calculate expected EPS for quarters where possible (from index 12 onwards)
  const expected: (number | null)[] = Array(N).fill(null);
  for (let i = 12; i < N; i++) {
    expected[i] = getExpectedEps(i);
  }

  // Calculate seasonal errors: error_t = EPS_t - expected_t
  const error: (number | null)[] = Array(N).fill(null);
  for (let i = 12; i < N; i++) {
    const currentEps = eps[i];
    const expEps = expected[i];
    if (currentEps !== null && expEps !== null) {
      error[i] = currentEps - expEps;
    }
  }

  // Now, for the latest quarter (N-1):
  const latestIndex = N - 1;
  const actualEps = eps[latestIndex];
  const expectedEps = expected[latestIndex];

  if (actualEps === null) {
    warnings.push(`YoY earnings trend: latest quarter EPS is missing or shares outstanding <= 0`);
  }
  if (expectedEps === null) {
    warnings.push(`YoY earnings trend: expected EPS for latest quarter cannot be computed due to missing inputs`);
  }

  // We need the last 12 seasonal errors (from index N-2 down to N-13)
  const errorsForStdev: number[] = [];
  let missingErrors = false;
  for (let i = 1; i <= 12; i++) {
    const err = error[latestIndex - i];
    if (err === null) {
      missingErrors = true;
      warnings.push(`YoY earnings trend: seasonal error at quarter index ${latestIndex - i} is missing`);
    } else {
      errorsForStdev.push(err);
    }
  }

  if (actualEps === null || expectedEps === null || missingErrors) {
    return {
      zScore: null,
      expectedEps,
      actualEps,
      sigma: null,
      verdict: "unknown",
      warnings,
    };
  }

  // Compute standard deviation (population formula)
  const meanError = errorsForStdev.reduce((sum, e) => sum + e, 0) / errorsForStdev.length;
  const variance = errorsForStdev.reduce((sum, e) => sum + Math.pow(e - meanError, 2), 0) / errorsForStdev.length;
  const sigma = Math.sqrt(variance);

  if (sigma === 0) {
    warnings.push("YoY earnings trend: standard deviation of seasonal errors is zero");
    return {
      zScore: null,
      expectedEps,
      actualEps,
      sigma: 0,
      verdict: "unknown",
      warnings,
    };
  }

  const zScore = (actualEps - expectedEps) / sigma;

  let verdict: EarningsTrendVerdict = "flat";
  if (zScore <= -1.5) {
    verdict = "deteriorating";
  } else if (zScore >= 1.5) {
    if (postReactionExcessReturn !== undefined && postReactionExcessReturn !== null && postReactionExcessReturn >= 0) {
      verdict = "improvingConfirmed";
    } else {
      verdict = "improvingUnconfirmed";
    }
  }

  return {
    zScore,
    expectedEps,
    actualEps,
    sigma,
    verdict,
    warnings,
  };
}
