import { FundamentalsQuarter } from "../screens/types";

export type MultipleBands = {
  median: number;
  low1: number;
  high1: number;
  low2: number;
  high2: number;
};

export type ValuationSample = {
  date: string;
  price: number;
  pe: number | null;
  ps: number | null;
  pfcf: number | null;
};

export type ValuationBandsResult = {
  pe: MultipleBands | null;
  ps: MultipleBands | null;
  pfcf: MultipleBands | null;
};

export type ValuationHistoryOutput = {
  series: ValuationSample[];
  bands: ValuationBandsResult;
  current: ValuationSample | null;
  verdict: "cheap" | "fair" | "rich" | "suspended";
};

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeMad(arr: number[], med: number): number {
  if (arr.length === 0) return 0;
  const devs = arr.map((x) => Math.abs(x - med));
  return median(devs);
}

function getFiveYearsAgo(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return "0000-00-00";
  const year = parseInt(parts[0], 10);
  const month = parts[1];
  const day = parts[2];
  return `${year - 5}-${month}-${day}`;
}

export function computeValuationHistory(
  prices: { d: string; close: number }[],
  quarters: FundamentalsQuarter[]
): ValuationHistoryOutput {
  const sortedPrices = [...prices].sort((a, b) => a.d.localeCompare(b.d));
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

  // Compute multiples for each monthly sample
  const series: ValuationSample[] = monthlySamples.map((sample) => {
    // Find TTM quarters as of the sample date
    const ttmQuarters = sortedQuarters.filter((q) => q.periodEnd.localeCompare(sample.d) <= 0).slice(-4);

    let pe: number | null = null;
    let ps: number | null = null;
    let pfcf: number | null = null;

    if (ttmQuarters.length === 4) {
      let niSum = 0;
      let revSum = 0;
      let fcfSum = 0;
      let missingNi = false;
      let missingRev = false;
      let missingFcf = false;

      for (const q of ttmQuarters) {
        if (q.netIncome === null || q.netIncome === undefined) missingNi = true;
        else niSum += q.netIncome;

        if (q.revenue === null || q.revenue === undefined) missingRev = true;
        else revSum += q.revenue;

        if (q.fcf === null || q.fcf === undefined) missingFcf = true;
        else fcfSum += q.fcf;
      }

      const shares = ttmQuarters[3].sharesOut;

      if (shares && shares > 0) {
        if (!missingNi && niSum > 0) {
          const eps = niSum / shares;
          pe = sample.close / eps;
        }
        if (!missingRev && revSum > 0) {
          const sps = revSum / shares;
          ps = sample.close / sps;
        }
        if (!missingFcf && fcfSum > 0) {
          const fps = fcfSum / shares;
          pfcf = sample.close / fps;
        }
      }
    }

    return {
      date: sample.d,
      price: sample.close,
      pe,
      ps,
      pfcf,
    };
  });

  const current = series.length > 0 ? series[series.length - 1] : null;

  // Compute bands over trailing 5y for the latest date
  let peBands: MultipleBands | null = null;
  let psBands: MultipleBands | null = null;
  let pfcfBands: MultipleBands | null = null;

  if (current) {
    const limitDate = getFiveYearsAgo(current.date);
    const trailingSamples = series.filter(
      (s) => s.date.localeCompare(limitDate) >= 0 && s.date.localeCompare(current.date) <= 0
    );

    const pes = trailingSamples.map((s) => s.pe).filter((v): v is number => v !== null && v > 0);
    const pss = trailingSamples.map((s) => s.ps).filter((v): v is number => v !== null && v > 0);
    const fcfps = trailingSamples.map((s) => s.pfcf).filter((v): v is number => v !== null && v > 0);

    const buildBands = (values: number[]): MultipleBands | null => {
      if (values.length < 3) return null; // need some history to compute median and MAD
      const med = median(values);
      const mad = computeMad(values, med);
      const step = 1.4826 * mad;
      return {
        median: med,
        low1: med - step,
        high1: med + step,
        low2: med - 2 * step,
        high2: med + 2 * step,
      };
    };

    peBands = buildBands(pes);
    psBands = buildBands(pss);
    pfcfBands = buildBands(fcfps);
  }

  // Determine the verdict
  let verdict: "cheap" | "fair" | "rich" | "suspended" = "suspended";

  if (current) {
    // Priority order: P/E -> P/FCF -> P/S
    let selectedValue: number | null = null;
    let selectedBands: MultipleBands | null = null;

    if (current.pe !== null && current.pe > 0 && peBands) {
      selectedValue = current.pe;
      selectedBands = peBands;
    } else if (current.pfcf !== null && current.pfcf > 0 && pfcfBands) {
      selectedValue = current.pfcf;
      selectedBands = pfcfBands;
    } else if (current.ps !== null && current.ps > 0 && psBands) {
      selectedValue = current.ps;
      selectedBands = psBands;
    }

    if (selectedValue !== null && selectedBands !== null) {
      if (selectedValue < selectedBands.low1) {
        verdict = "cheap";
      } else if (selectedValue > selectedBands.high1) {
        verdict = "rich";
      } else {
        verdict = "fair";
      }
    }
  }

  return {
    series,
    bands: {
      pe: peBands,
      ps: psBands,
      pfcf: pfcfBands,
    },
    current,
    verdict,
  };
}
