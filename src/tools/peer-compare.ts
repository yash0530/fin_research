import { percentileRank } from "./relative-rank";

// Peer comparison: where the target sits within its cohort on key metrics. Pure.
// Cohort is built by the caller (AI-lens first, GICS fallback) from TickerSector.

export type PeerRow = {
  symbol: string;
  forwardPE?: number | null;
  revenueGrowthPct?: number | null;
  profitMarginPct?: number | null;
};

export type PeerCompare = {
  symbol: string;
  cohortSize: number;
  percentiles: {
    forwardPE: number | null;
    revenueGrowthPct: number | null;
    profitMarginPct: number | null;
  };
};

function pctFor(cohort: PeerRow[], key: keyof Omit<PeerRow, "symbol">, value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const vals = cohort.map((p) => p[key]).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  return percentileRank(vals, value);
}

export function peerCompare(targetSymbol: string, cohort: PeerRow[]): PeerCompare {
  const target = cohort.find((p) => p.symbol.toUpperCase() === targetSymbol.toUpperCase());
  return {
    symbol: targetSymbol.toUpperCase(),
    cohortSize: cohort.length,
    percentiles: {
      forwardPE: pctFor(cohort, "forwardPE", target?.forwardPE),
      revenueGrowthPct: pctFor(cohort, "revenueGrowthPct", target?.revenueGrowthPct),
      profitMarginPct: pctFor(cohort, "profitMarginPct", target?.profitMarginPct),
    },
  };
}
