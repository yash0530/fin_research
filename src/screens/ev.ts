import type { FundamentalsQuarter } from "./types";

export type EvToEbitResult = {
  evToEbit: number | null;
  /** True when the TTM window skipped quarters with missing operatingIncome. */
  staleWindow: boolean;
  warnings: string[];
};

// Recent quarters (often Yahoo-sourced) frequently lack operatingIncome while
// older XBRL quarters have it, so a strict last-4 window starves the cohort
// screen. Fallback: the last 4 quarters that HAVE operatingIncome, as long as
// the newest of them isn't ancient relative to the newest known quarter.
const MAX_STALENESS_DAYS = 540;

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

/** EV/EBIT on the freshest available TTM EBIT window. Pure; quarters oldest→newest. */
export function computeEvToEbit(
  quarters: FundamentalsQuarter[],
  marketCap: number | null,
): EvToEbitResult {
  const warnings: string[] = [];
  if (marketCap === null || marketCap <= 0) {
    return { evToEbit: null, staleWindow: false, warnings: ["EV/EBIT: no market cap"] };
  }
  const sorted = [...quarters].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const withOi = sorted.filter(
    (q) => q.operatingIncome !== null && q.operatingIncome !== undefined,
  );
  if (withOi.length < 4) {
    return {
      evToEbit: null,
      staleWindow: false,
      warnings: [`EV/EBIT: only ${withOi.length} quarters with operating income (need 4)`],
    };
  }

  const window = withOi.slice(-4);
  const newestKnown = sorted[sorted.length - 1].periodEnd;
  const newestUsed = window[window.length - 1].periodEnd;
  if (daysBetween(newestKnown, newestUsed) > MAX_STALENESS_DAYS) {
    return {
      evToEbit: null,
      staleWindow: true,
      warnings: [`EV/EBIT: freshest operating-income quarter (${newestUsed}) is stale vs ${newestKnown}`],
    };
  }

  const staleWindow = newestUsed !== newestKnown || window.some((q, i) => {
    const idx = sorted.indexOf(q);
    const prevIdx = i > 0 ? sorted.indexOf(window[i - 1]) : idx - 1;
    return i > 0 && idx - prevIdx > 1;
  });
  if (staleWindow) {
    warnings.push(`EV/EBIT: TTM window skips quarters with missing operating income (newest used ${newestUsed})`);
  }

  const ebit = window.reduce((sum, q) => sum + (q.operatingIncome as number), 0);
  if (ebit <= 0) {
    return { evToEbit: null, staleWindow, warnings: [...warnings, "EV/EBIT: non-positive TTM EBIT — multiple suspended"] };
  }

  // Debt/cash from the newest quarter carrying them (balance-sheet fields can
  // also be missing on the very latest row).
  let totalDebt: number | null = null;
  let cash: number | null = null;
  for (let i = sorted.length - 1; i >= 0 && (totalDebt === null || cash === null); i--) {
    if (totalDebt === null && sorted[i].totalDebt !== null && sorted[i].totalDebt !== undefined) {
      totalDebt = sorted[i].totalDebt as number;
    }
    if (cash === null && sorted[i].cash !== null && sorted[i].cash !== undefined) {
      cash = sorted[i].cash as number;
    }
  }
  const ev = marketCap + (totalDebt ?? 0) - (cash ?? 0);
  if (totalDebt === null) warnings.push("EV/EBIT: totalDebt missing, treated as 0");
  if (cash === null) warnings.push("EV/EBIT: cash missing, treated as 0");

  return { evToEbit: ev / ebit, staleWindow, warnings };
}
