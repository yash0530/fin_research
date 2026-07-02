// Discounted-cash-flow fair value, 3 scenarios (bear/base/bull). Pure math over
// plain inputs so it is fully golden-testable. Port of dcf_valuation.py semantics.

export type DcfInputs = {
  /** Most recent trailing free cash flow (currency units). */
  baseFcf: number;
  sharesOut: number;
  /** Debt minus cash. Positive = net debt, negative = net cash. */
  netDebt: number;
};

export type DcfScenario = {
  /** Annual FCF growth during the explicit horizon (decimal, e.g. 0.10). */
  growthRate: number;
  /** Explicit forecast horizon in years. */
  years: number;
  /** Perpetuity growth after the horizon. */
  terminalGrowth: number;
  /** Discount rate / WACC (decimal). Must exceed terminalGrowth. */
  discountRate: number;
};

export type DcfScenarioResult = {
  pvExplicit: number;
  pvTerminal: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
};

export function dcfScenario(inputs: DcfInputs, s: DcfScenario): DcfScenarioResult {
  if (s.discountRate <= s.terminalGrowth) {
    throw new Error("discountRate must exceed terminalGrowth for a finite terminal value");
  }
  let pvExplicit = 0;
  let fcf = inputs.baseFcf;
  for (let t = 1; t <= s.years; t++) {
    fcf = fcf * (1 + s.growthRate);
    pvExplicit += fcf / Math.pow(1 + s.discountRate, t);
  }
  // `fcf` is now the horizon-year FCF. Gordon terminal value, discounted back.
  const terminalValue = (fcf * (1 + s.terminalGrowth)) / (s.discountRate - s.terminalGrowth);
  const pvTerminal = terminalValue / Math.pow(1 + s.discountRate, s.years);
  const enterpriseValue = pvExplicit + pvTerminal;
  const equityValue = enterpriseValue - inputs.netDebt;
  const fairValuePerShare = inputs.sharesOut > 0 ? equityValue / inputs.sharesOut : 0;
  return { pvExplicit, pvTerminal, enterpriseValue, equityValue, fairValuePerShare };
}

export type ThreeScenarioInput = {
  bear: DcfScenario;
  base: DcfScenario;
  bull: DcfScenario;
};

export type DcfResult = {
  bear: DcfScenarioResult;
  base: DcfScenarioResult;
  bull: DcfScenarioResult;
  /** Convenience: the three fair values. */
  fairValueRange: { low: number; mid: number; high: number };
};

export function dcfThreeScenario(inputs: DcfInputs, scenarios: ThreeScenarioInput): DcfResult {
  const bear = dcfScenario(inputs, scenarios.bear);
  const base = dcfScenario(inputs, scenarios.base);
  const bull = dcfScenario(inputs, scenarios.bull);
  const values = [bear.fairValuePerShare, base.fairValuePerShare, bull.fairValuePerShare];
  return {
    bear,
    base,
    bull,
    fairValueRange: {
      low: Math.min(...values),
      mid: base.fairValuePerShare,
      high: Math.max(...values),
    },
  };
}

/** Upside/(downside) of a fair value vs the current price, in percent. */
export function upsidePct(fairValue: number, currentPrice: number): number | null {
  if (currentPrice <= 0) return null;
  return ((fairValue - currentPrice) / currentPrice) * 100;
}
