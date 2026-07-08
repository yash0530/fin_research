import type { FundamentalsQuarter } from "./types";

// Yahoo and EDGAR/XBRL report the SAME fiscal quarter under slightly different
// period-end dates (e.g. calendar month-end 2026-03-31 vs the true fiscal close
// 2026-03-28), and each source carries a DIFFERENT subset of fields — the EDGAR
// row often has cfo, the Yahoo row the balance-sheet instants. Left un-merged,
// every fundamentals screen sees the fields fragmented across two rows and
// collapses (F-Score ≈ 0, accruals "unknown"). This field-wise merge collapses
// each near-duplicate cluster into one complete quarter. Pure; input any order.

const CLUSTER_DAYS = 10;

const NUMERIC_FIELDS: (keyof Omit<FundamentalsQuarter, "symbol" | "periodEnd">)[] = [
  "revenue", "grossProfit", "operatingIncome", "netIncome", "fcf", "capex",
  "totalAssets", "totalDebt", "cash", "equity", "sharesOut", "cfo", "sga",
  "depreciation", "receivables", "currentAssets", "currentLiabilities",
  "retainedEarnings", "ppe",
];

function daysApart(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

/** Merge one cluster: latest periodEnd; each numeric field = first non-null,
 *  preferring the later-dated row (rows arrive newest-first here). */
function mergeCluster(cluster: FundamentalsQuarter[]): FundamentalsQuarter {
  const newestFirst = [...cluster].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const merged: FundamentalsQuarter = {
    symbol: newestFirst[0].symbol,
    periodEnd: newestFirst[0].periodEnd,
  };
  for (const field of NUMERIC_FIELDS) {
    let value: number | null = null;
    for (const row of newestFirst) {
      const v = row[field];
      if (v !== null && v !== undefined) {
        value = v;
        break;
      }
    }
    merged[field] = value;
  }
  return merged;
}

/**
 * The subset of quarters (oldest→newest) that carry EVERY required field. A TTM
 * screen must build its trailing window from these, not a literal `slice(-4)`:
 * the newest calendar quarter routinely predates its own cash-flow statement
 * (the 10-Q lags), so a strict last-4 window is voided by one un-filed CFO even
 * when the company has years of complete history. Selecting the freshest COMPLETE
 * quarters is the honest TTM proxy (and matches `ev.ts`'s freshest-window logic).
 */
export function quartersWith(
  quarters: FundamentalsQuarter[],
  requiredFields: (keyof Omit<FundamentalsQuarter, "symbol" | "periodEnd">)[],
): FundamentalsQuarter[] {
  return [...quarters]
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
    .filter((q) => requiredFields.every((f) => q[f] != null));
}

/**
 * Collapse near-duplicate quarters (period-end within 10 days) into one complete
 * row each, field-wise. Returns quarters sorted oldest→newest — the contract every
 * screen expects. Idempotent: already-clean input passes through unchanged.
 */
export function mergeQuarters(quarters: FundamentalsQuarter[]): FundamentalsQuarter[] {
  if (quarters.length === 0) return [];
  const sorted = [...quarters].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  const clusters: FundamentalsQuarter[][] = [];
  let current: FundamentalsQuarter[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    // Compare to the earliest member so a run of tightly-spaced rows stays one
    // cluster, but genuine adjacent quarters (~90 days apart) never merge.
    if (daysApart(sorted[i].periodEnd, current[0].periodEnd) <= CLUSTER_DAYS) {
      current.push(sorted[i]);
    } else {
      clusters.push(current);
      current = [sorted[i]];
    }
  }
  clusters.push(current);

  // Drop non-reporting quarters: the un-decomposed fiscal Q4 of a non-December
  // fiscal-year-end company (e.g. MSFT's June quarter) carries only balance-sheet
  // instants (totalAssets/equity) while its flows live solely in the annual 10-K.
  // A null netIncome means "not reported" (a reported loss is present-and-negative),
  // so such a row is not a usable quarter for income/cash-flow TTM screens and only
  // poisons the trailing-4 window every screen slices. Keep the freshest genuinely
  // reported quarters instead.
  return clusters.map(mergeCluster).filter((q) => q.netIncome != null);
}
