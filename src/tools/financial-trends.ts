// Multi-quarter trajectory math over quarterly fundamentals. Pure; quarters are
// passed oldest → newest. Port of financial_trends.py semantics.

import { pctChange } from "../lib/metrics";

export type Quarter = {
  periodEnd: string; // YYYY-MM-DD
  revenue: number;
  netIncome: number;
  grossProfit: number;
  fcf: number;
};

export type TrendReport = {
  quarters: number;
  revenueYoYPct: number | null;
  revenueQoQPct: number | null;
  grossMarginLatest: number | null;
  grossMarginYoYDeltaPP: number | null;
  netMarginLatest: number | null;
  fcfMarginLatest: number | null;
  revenueTrend: "accelerating" | "decelerating" | "flat" | "insufficient";
};

export function financialTrends(quarters: Quarter[]): TrendReport {
  const n = quarters.length;
  const base: TrendReport = {
    quarters: n,
    revenueYoYPct: null,
    revenueQoQPct: null,
    grossMarginLatest: null,
    grossMarginYoYDeltaPP: null,
    netMarginLatest: null,
    fcfMarginLatest: null,
    revenueTrend: "insufficient",
  };
  if (n === 0) return base;

  const latest = quarters[n - 1];
  base.grossMarginLatest = latest.revenue !== 0 ? latest.grossProfit / latest.revenue : null;
  base.netMarginLatest = latest.revenue !== 0 ? latest.netIncome / latest.revenue : null;
  base.fcfMarginLatest = latest.revenue !== 0 ? latest.fcf / latest.revenue : null;

  if (n >= 2) {
    base.revenueQoQPct = pctChange(quarters[n - 2].revenue, latest.revenue);
  }
  if (n >= 5) {
    const yearAgo = quarters[n - 5];
    base.revenueYoYPct = pctChange(yearAgo.revenue, latest.revenue);
    if (yearAgo.revenue !== 0) {
      const gmYearAgo = yearAgo.grossProfit / yearAgo.revenue;
      const gmLatest = latest.grossProfit / latest.revenue;
      base.grossMarginYoYDeltaPP = (gmLatest - gmYearAgo) * 100;
    }
  }
  if (n >= 6) {
    const latestYoY = pctChange(quarters[n - 5].revenue, quarters[n - 1].revenue);
    const priorYoY = pctChange(quarters[n - 6].revenue, quarters[n - 2].revenue);
    if (latestYoY !== null && priorYoY !== null) {
      const delta = latestYoY - priorYoY;
      base.revenueTrend = delta > 0.5 ? "accelerating" : delta < -0.5 ? "decelerating" : "flat";
    }
  }
  return base;
}
