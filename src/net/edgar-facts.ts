// EDGAR companyfacts → quarterly fundamentals. Free, official XBRL from
// data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json — YEARS of history vs Yahoo's
// ~7 quarters. Pure parser (tested with a fixture; validated live against MU).
//
// XBRL subtlety this handles: "flow" concepts (revenue, income, capex, CFO) carry
// start+end and are filed at 3/6/9/12-month durations. We take clean SINGLE-QUARTER
// points (≈3 months) directly, and DERIVE the 4th quarter as (fiscal-year total −
// the three single-quarter points in that FY) only when exactly three exist — never
// risky subtraction of overlapping cumulatives. "Instant" concepts (assets, cash,
// equity, debt, shares) are point-in-time snapshots keyed by their end date.

import type { FundamentalsQuarterRow } from "../db/queries";

export type FactPoint = { start?: string; end: string; val: number; fy?: number; fp?: string; form?: string };
export type CompanyFacts = {
  facts?: {
    "us-gaap"?: Record<string, { units?: Record<string, FactPoint[]> }>;
    dei?: Record<string, { units?: Record<string, FactPoint[]> }>;
  };
};

// First matching concept wins (fallbacks for reporting-taxonomy variation).
const FLOW_CONCEPTS = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  cfo: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  sga: ["SellingGeneralAndAdministrativeExpense"],
  depreciation: ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet"],
} as const;

const INSTANT_CONCEPTS = {
  totalAssets: ["Assets"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  receivables: ["AccountsReceivableNetCurrent"],
  currentAssets: ["AssetsCurrent"],
  currentLiabilities: ["LiabilitiesCurrent"],
  retainedEarnings: ["RetainedEarningsAccumulatedDeficit"],
  ppe: ["PropertyPlantAndEquipmentNet"],
} as const;

function daysBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 86_400_000);
}

function firstConcept(
  facts: NonNullable<CompanyFacts["facts"]>["us-gaap"],
  names: readonly string[],
): FactPoint[] | null {
  if (!facts) return null;
  for (const name of names) {
    const units = facts[name]?.units;
    if (!units) continue;
    // Prefer a USD unit; else the first unit present.
    const key = Object.keys(units).find((k) => k.includes("USD")) ?? Object.keys(units)[0];
    if (key && units[key]?.length) return units[key];
  }
  return null;
}

/** Single-quarter (≈3-month) flow values keyed by period-end, plus Q4 derived from
 *  the fiscal-year total when exactly three quarters are present for that FY. */
function quarterlyFlow(points: FactPoint[] | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!points) return out;
  const filed = points.filter((p) => p.start && (p.form === "10-Q" || p.form === "10-K"));
  const quarters = filed.filter((p) => {
    const d = daysBetween(p.start as string, p.end);
    return d >= 80 && d <= 100;
  });
  for (const q of quarters) out.set(q.end, q.val); // last write wins (amended filings)

  // Derive Q4 = FY − (the three single-quarter points in that fiscal year).
  const annuals = filed.filter((p) => {
    const d = daysBetween(p.start as string, p.end);
    return d >= 350 && d <= 380;
  });
  for (const fy of annuals) {
    const inYear = quarters.filter((q) => q.start === fy.start || (q.fy === fy.fy && q.end <= fy.end));
    // Take the three quarters whose ends precede the FY end, in the same fiscal year.
    const priors = inYear.filter((q) => q.end < fy.end && q.fy === fy.fy);
    if (priors.length === 3 && !out.has(fy.end)) {
      const q4 = fy.val - priors.reduce((s, q) => s + q.val, 0);
      out.set(fy.end, q4);
    }
  }
  return out;
}

/** Instant snapshot keyed by end date. */
function instant(points: FactPoint[] | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!points) return out;
  for (const p of points) if (!p.start) out.set(p.end, p.val);
  return out;
}

/** Total debt = long-term (current + noncurrent) instants summed, else a single LT concept. */
function totalDebt(gaap: NonNullable<CompanyFacts["facts"]>["us-gaap"]): Map<string, number> {
  const nonCurrent = instant(firstConcept(gaap, ["LongTermDebtNoncurrent"]));
  const current = instant(firstConcept(gaap, ["LongTermDebtCurrent"]));
  const combined = new Map<string, number>();
  const ends = new Set([...nonCurrent.keys(), ...current.keys()]);
  for (const e of ends) combined.set(e, (nonCurrent.get(e) ?? 0) + (current.get(e) ?? 0));
  if (combined.size > 0) return combined;
  return instant(firstConcept(gaap, ["LongTermDebt", "DebtLongtermAndShorttermCombinedAmount"]));
}

/** Shares outstanding: prefer dei entity shares (instant), else a us-gaap fallback. */
function sharesOut(facts: NonNullable<CompanyFacts["facts"]>): Map<string, number> {
  const dei = firstConcept(facts.dei, ["EntityCommonStockSharesOutstanding"]);
  const fromDei = instant(dei);
  if (fromDei.size > 0) return fromDei;
  return instant(firstConcept(facts["us-gaap"], ["CommonStockSharesOutstanding"]));
}

export function parseCompanyFacts(symbol: string, json: CompanyFacts): FundamentalsQuarterRow[] {
  const facts = json.facts;
  if (!facts) return [];
  const gaap = facts["us-gaap"];

  const revenue = quarterlyFlow(firstConcept(gaap, FLOW_CONCEPTS.revenue));
  const grossProfit = quarterlyFlow(firstConcept(gaap, FLOW_CONCEPTS.grossProfit));
  const operatingIncome = quarterlyFlow(firstConcept(gaap, FLOW_CONCEPTS.operatingIncome));
  const netIncome = quarterlyFlow(firstConcept(gaap, FLOW_CONCEPTS.netIncome));
  const rawCapex = firstConcept(gaap, FLOW_CONCEPTS.capex);
  const capex = quarterlyFlow(rawCapex ? rawCapex.map((p) => ({ ...p, val: Math.abs(p.val) })) : null);
  const cfo = quarterlyFlow(firstConcept(gaap, FLOW_CONCEPTS.cfo));
  const sga = quarterlyFlow(firstConcept(gaap, FLOW_CONCEPTS.sga));
  const depreciation = quarterlyFlow(firstConcept(gaap, FLOW_CONCEPTS.depreciation));
  const totalAssets = instant(firstConcept(gaap, INSTANT_CONCEPTS.totalAssets));
  const cash = instant(firstConcept(gaap, INSTANT_CONCEPTS.cash));
  const equity = instant(firstConcept(gaap, INSTANT_CONCEPTS.equity));
  const receivables = instant(firstConcept(gaap, INSTANT_CONCEPTS.receivables));
  const currentAssets = instant(firstConcept(gaap, INSTANT_CONCEPTS.currentAssets));
  const currentLiabilities = instant(firstConcept(gaap, INSTANT_CONCEPTS.currentLiabilities));
  const retainedEarnings = instant(firstConcept(gaap, INSTANT_CONCEPTS.retainedEarnings));
  const ppe = instant(firstConcept(gaap, INSTANT_CONCEPTS.ppe));
  const debt = totalDebt(gaap);
  const shares = sharesOut(facts);

  // Union of every period-end we have ANY fact for.
  const ends = new Set<string>();
  for (const m of [
    revenue,
    grossProfit,
    operatingIncome,
    netIncome,
    capex,
    cfo,
    sga,
    depreciation,
    totalAssets,
    cash,
    equity,
    receivables,
    currentAssets,
    currentLiabilities,
    retainedEarnings,
    ppe,
    debt,
    shares,
  ])
    for (const e of m.keys()) ends.add(e);

  const rows: FundamentalsQuarterRow[] = [];
  for (const periodEnd of [...ends].sort()) {
    const capexV = capex.get(periodEnd);
    const cfoV = cfo.get(periodEnd);
    const fcf = cfoV !== undefined && capexV !== undefined ? cfoV - capexV : null;
    rows.push({
      symbol: symbol.toUpperCase(),
      periodEnd,
      revenue: revenue.get(periodEnd) ?? null,
      grossProfit: grossProfit.get(periodEnd) ?? null,
      operatingIncome: operatingIncome.get(periodEnd) ?? null,
      netIncome: netIncome.get(periodEnd) ?? null,
      fcf,
      capex: capexV ?? null,
      totalAssets: totalAssets.get(periodEnd) ?? null,
      totalDebt: debt.get(periodEnd) ?? null,
      cash: cash.get(periodEnd) ?? null,
      equity: equity.get(periodEnd) ?? null,
      sharesOut: shares.get(periodEnd) ?? null,
      cfo: cfoV ?? null,
      sga: sga.get(periodEnd) ?? null,
      depreciation: depreciation.get(periodEnd) ?? null,
      receivables: receivables.get(periodEnd) ?? null,
      currentAssets: currentAssets.get(periodEnd) ?? null,
      currentLiabilities: currentLiabilities.get(periodEnd) ?? null,
      retainedEarnings: retainedEarnings.get(periodEnd) ?? null,
      ppe: ppe.get(periodEnd) ?? null,
    });
  }
  // Keep only rows that carry at least one income-statement or balance-sheet fact.
  return rows.filter(
    (r) => r.revenue != null || r.netIncome != null || r.totalAssets != null || r.equity != null,
  );
}
