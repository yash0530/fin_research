import { FundamentalsQuarter } from "../screens/types";
import { median, computeMad, getFiveYearsAgo, MultipleBands } from "./valuation-history";

export type EarningsYieldSample = {
  date: string;
  price: number;
  earningsYield: number | null;
};

export type EarningsYieldBandsResult = {
  series: EarningsYieldSample[];
  bands: MultipleBands | null;
  current: EarningsYieldSample | null;
  spread: number | null;
  verdict: "cheap" | "fair" | "rich" | "suspended";
};

export function computeEarningsYieldBands(
  closes: { d: string; close: number }[],
  quarters: FundamentalsQuarter[],
  benchmarkYield?: number,
): EarningsYieldBandsResult {
  const sortedPrices = [...closes].sort((a, b) => a.d.localeCompare(b.d));
  const sortedQuarters = [...quarters].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  // Monthly sampling: group prices by YYYY-MM and take the last price in each month
  const monthlyMap = new Map<string, { d: string; close: number }>();
  for (const p of sortedPrices) {
    const key = p.d.slice(0, 7); // YYYY-MM
    const existing = monthlyMap.get(key);
    if (!existing || p.d.localeCompare(existing.d) > 0) {
      monthlyMap.set(key, p);
    }
  }

  const monthlySamples = Array.from(monthlyMap.values()).sort((a, b) => a.d.localeCompare(b.d));

  // Compute earnings yield for each monthly sample
  const series: EarningsYieldSample[] = monthlySamples.map((sample) => {
    // Find TTM quarters as of the sample date
    const ttmQuarters = sortedQuarters.filter((q) => q.periodEnd.localeCompare(sample.d) <= 0).slice(-4);

    let earningsYield: number | null = null;

    if (ttmQuarters.length === 4) {
      let niSum = 0;
      let missingNi = false;

      for (const q of ttmQuarters) {
        if (q.netIncome === null || q.netIncome === undefined) {
          missingNi = true;
        } else {
          niSum += q.netIncome;
        }
      }

      const shares = ttmQuarters[3].sharesOut;

      if (!missingNi && shares && shares > 0) {
        const eps = niSum / shares;
        earningsYield = eps / sample.close;
      }
    }

    return {
      date: sample.d,
      price: sample.close,
      earningsYield,
    };
  });

  const current = series.length > 0 ? series[series.length - 1] : null;

  // Compute bands over trailing 5y for the latest date
  let bands: MultipleBands | null = null;
  if (current) {
    const limitDate = getFiveYearsAgo(current.date);
    const trailingSamples = series.filter(
      (s) => s.date.localeCompare(limitDate) >= 0 && s.date.localeCompare(current.date) <= 0
    );

    // Filter positive yields only (mirroring valuation-history's band math)
    const yields = trailingSamples
      .map((s) => s.earningsYield)
      .filter((v): v is number => v !== null && v > 0);

    if (yields.length >= 3) {
      const med = median(yields);
      const mad = computeMad(yields, med);
      const step = 1.4826 * mad;
      bands = {
        median: med,
        low1: med - step,
        high1: med + step,
        low2: med - 2 * step,
        high2: med + 2 * step,
      };
    }
  }

  // Calculate spread (current earnings yield - benchmarkYield)
  let spread: number | null = null;
  if (current && current.earningsYield !== null && benchmarkYield !== undefined && benchmarkYield !== null) {
    spread = current.earningsYield - benchmarkYield;
  }

  // Determine verdict
  let verdict: "cheap" | "fair" | "rich" | "suspended" = "suspended";

  if (current && current.earningsYield !== null && current.earningsYield > 0 && bands) {
    const selectedValue = current.earningsYield;
    // Higher earnings yield means CHEAPER (lower price relative to earnings)
    // Lower earnings yield means RICHER (higher price relative to earnings)
    if (selectedValue > bands.high1) {
      verdict = "cheap";
    } else if (selectedValue < bands.low1) {
      verdict = "rich";
    } else {
      verdict = "fair";
    }
  }

  return {
    series,
    bands,
    current,
    spread,
    verdict,
  };
}
