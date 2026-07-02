// Quality-of-Earnings forensics. Canonical formulas (Beneish 1999, Altman 1968,
// Piotroski 2000) computed from two consecutive annual periods. Port of
// qoe_forensics.py; the MATH is verbatim-canonical and golden-tested against
// hand-derived values. (Data assembly — annual periods from local quarterly
// fundamentals — is handled by the caller; this module is pure.)

export type AnnualPeriod = {
  revenue: number;
  grossProfit: number;
  sga: number;
  depreciation: number;
  ebit: number;
  netIncome: number;
  receivables: number;
  currentAssets: number;
  ppe: number; // net PPE
  totalAssets: number;
  currentLiabilities: number;
  longTermDebt: number;
  totalLiabilities: number;
  retainedEarnings: number;
  sharesOut: number;
  cfo: number; // operating cash flow
  workingCapital?: number; // else currentAssets - currentLiabilities
  sbc?: number;
  marketValueEquity?: number; // for Altman X4; falls back to book equity
};

const wc = (p: AnnualPeriod): number =>
  p.workingCapital ?? p.currentAssets - p.currentLiabilities;
const grossMargin = (p: AnnualPeriod): number => p.grossProfit / p.revenue;

/** (Net income − CFO) / total assets. Negative = conservative (CFO exceeds earnings). */
export function accrualRatio(p: AnnualPeriod): number {
  return (p.netIncome - p.cfo) / p.totalAssets;
}

/** Altman Z (public-manufacturing variant). >2.99 safe, <1.81 distress. */
export function altmanZ(p: AnnualPeriod): number {
  const mve = p.marketValueEquity ?? p.totalAssets - p.totalLiabilities;
  const x1 = wc(p) / p.totalAssets;
  const x2 = p.retainedEarnings / p.totalAssets;
  const x3 = p.ebit / p.totalAssets;
  const x4 = mve / p.totalLiabilities;
  const x5 = p.revenue / p.totalAssets;
  return 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
}

/** Piotroski F-Score (0–9), current period vs prior. Higher = stronger fundamentals. */
export function piotroskiF(t: AnnualPeriod, p: AnnualPeriod): number {
  let score = 0;
  const roaT = t.netIncome / t.totalAssets;
  const roaP = p.netIncome / p.totalAssets;
  // Profitability (4)
  if (roaT > 0) score += 1;
  if (t.cfo > 0) score += 1;
  if (roaT > roaP) score += 1;
  if (t.cfo > t.netIncome) score += 1; // accrual quality
  // Leverage / liquidity / dilution (3)
  if (t.longTermDebt / t.totalAssets < p.longTermDebt / p.totalAssets) score += 1;
  if (t.currentAssets / t.currentLiabilities > p.currentAssets / p.currentLiabilities) score += 1;
  if (t.sharesOut <= p.sharesOut) score += 1;
  // Efficiency (2)
  if (grossMargin(t) > grossMargin(p)) score += 1;
  if (t.revenue / t.totalAssets > p.revenue / p.totalAssets) score += 1;
  return score;
}

export type BeneishComponents = {
  DSRI: number;
  GMI: number;
  AQI: number;
  SGI: number;
  DEPI: number;
  SGAI: number;
  LVGI: number;
  TATA: number;
};

export function beneishComponents(t: AnnualPeriod, p: AnnualPeriod): BeneishComponents {
  const DSRI = t.receivables / t.revenue / (p.receivables / p.revenue);
  const GMI = grossMargin(p) / grossMargin(t);
  const aqiT = 1 - (t.currentAssets + t.ppe) / t.totalAssets;
  const aqiP = 1 - (p.currentAssets + p.ppe) / p.totalAssets;
  const AQI = aqiT / aqiP;
  const SGI = t.revenue / p.revenue;
  const depiT = t.depreciation / (t.depreciation + t.ppe);
  const depiP = p.depreciation / (p.depreciation + p.ppe);
  const DEPI = depiP / depiT;
  const SGAI = t.sga / t.revenue / (p.sga / p.revenue);
  const LVGI =
    (t.longTermDebt + t.currentLiabilities) / t.totalAssets /
    ((p.longTermDebt + p.currentLiabilities) / p.totalAssets);
  const TATA = (t.netIncome - t.cfo) / t.totalAssets;
  return { DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, TATA };
}

/** Beneish M-Score. > −1.78 flags a likely earnings manipulator. */
export function beneishM(t: AnnualPeriod, p: AnnualPeriod): number {
  const c = beneishComponents(t, p);
  return (
    -4.84 +
    0.92 * c.DSRI +
    0.528 * c.GMI +
    0.404 * c.AQI +
    0.892 * c.SGI +
    0.115 * c.DEPI -
    0.172 * c.SGAI +
    4.679 * c.TATA -
    0.327 * c.LVGI
  );
}

export type QoeReport = {
  accrualRatio: number;
  altmanZ: number;
  altmanZone: "safe" | "grey" | "distress";
  piotroskiF: number;
  beneishM: number;
  beneishFlag: "likely_manipulator" | "unlikely_manipulator";
  sbcPctRevenue: number | null;
  flags: string[];
};

export function qoeReport(t: AnnualPeriod, p: AnnualPeriod): QoeReport {
  const z = altmanZ(t);
  const m = beneishM(t, p);
  const f = piotroskiF(t, p);
  const acc = accrualRatio(t);
  const sbcPct = t.sbc !== undefined ? t.sbc / t.revenue : null;

  const flags: string[] = [];
  if (m > -1.78) flags.push("Beneish M-Score suggests possible earnings manipulation");
  if (z < 1.81) flags.push("Altman Z in distress zone");
  if (f <= 3) flags.push("Weak Piotroski fundamentals");
  if (acc > 0.1) flags.push("High positive accruals (earnings exceed cash flow)");
  if (sbcPct !== null && sbcPct > 0.15) flags.push("SBC exceeds 15% of revenue");

  return {
    accrualRatio: acc,
    altmanZ: z,
    altmanZone: z > 2.99 ? "safe" : z < 1.81 ? "distress" : "grey",
    piotroskiF: f,
    beneishM: m,
    beneishFlag: m > -1.78 ? "likely_manipulator" : "unlikely_manipulator",
    sbcPctRevenue: sbcPct,
    flags,
  };
}
