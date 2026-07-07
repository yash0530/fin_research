import type { InsiderTxLike } from "./types";

export type InsiderClusterResult = {
  clustered: boolean;
  windowStart: string | null;
  insiders: string[];
  totalValue: number;
  warnings: string[];
};

export function checkInsiderCluster(
  txs: InsiderTxLike[],
  marketCap: number | null,
): InsiderClusterResult {
  const warnings: string[] = [];

  if (marketCap === null || marketCap === undefined) {
    warnings.push("InsiderCluster: marketCap is missing; defaulting to <=$20B regime thresholds (>=3 distinct, >=$100k)");
  }

  // Filter out 10b5-1 plans and passive 10% owners
  const filteredTxs = txs.filter((tx) => {
    // 10b5-1 plan check
    if (tx.tenB51 === 1) return false;

    // Passive 10% owner check: 10% owner but not director and not officer
    const isDirector = /director/i.test(tx.filerRole);
    const isOfficer = /officer/i.test(tx.filerRole);
    const isPassiveTenPercent = tx.tenPercentOwner === 1 && !isDirector && !isOfficer;

    return !isPassiveTenPercent;
  });

  if (filteredTxs.length === 0) {
    return {
      clustered: false,
      windowStart: null,
      insiders: [],
      totalValue: 0,
      warnings,
    };
  }

  // Sort by transaction date ascending
  const sorted = [...filteredTxs].sort((a, b) => a.txDate.localeCompare(b.txDate));

  const effectiveCap = marketCap ?? 0;
  const isLargeCap = effectiveCap > 20_000_000_000;
  const minInsiders = isLargeCap ? 2 : 3;
  const minValue = isLargeCap ? 500_000 : 100_000;

  let bestWindow: { windowStart: string; insiders: string[]; totalValue: number } | null = null;

  // Evaluate 30-day rolling window starting at each transaction date
  for (let i = 0; i < sorted.length; i++) {
    const startTx = sorted[i];
    const startDate = new Date(startTx.txDate);
    const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    const windowTxs = sorted.filter((tx) => {
      const txDate = new Date(tx.txDate);
      return txDate >= startDate && txDate <= endDate;
    });

    const uniqueInsiders = Array.from(new Set(windowTxs.map((tx) => tx.filerName)));
    const totalValue = windowTxs.reduce((sum, tx) => sum + tx.value, 0);

    if (uniqueInsiders.length >= minInsiders && totalValue >= minValue) {
      // If we find multiple valid windows, pick the one with the latest start date.
      if (!bestWindow || startTx.txDate.localeCompare(bestWindow.windowStart) >= 0) {
        bestWindow = {
          windowStart: startTx.txDate,
          insiders: uniqueInsiders,
          totalValue,
        };
      }
    }
  }

  if (bestWindow) {
    return {
      clustered: true,
      windowStart: bestWindow.windowStart,
      insiders: bestWindow.insiders,
      totalValue: bestWindow.totalValue,
      warnings,
    };
  }

  return {
    clustered: false,
    windowStart: null,
    insiders: [],
    totalValue: 0,
    warnings,
  };
}
