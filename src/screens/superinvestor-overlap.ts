export type SuperinvestorHolder = {
  name: string;
  shares: number;
  value: number; // in USD thousands
};

export type SuperinvestorOverlapResult = {
  symbol: string;
  holders: SuperinvestorHolder[];
  holderCount: number;
  newThisQuarter?: boolean;
};

// Minimal type for InstitutionalHolding parameter to keep the screen pure and decouple from prisma/client if needed
export type ScreenHoldingInput = {
  filerCik: string;
  filerName: string;
  periodOfReport: string;
  cusip: string;
  nameOfIssuer: string;
  value: number;
  shares: number;
  filedAt: string;
};

/**
 * Pure screen module to compute overlap among superinvestor holdings.
 * Maps CUSIP to symbol using the provided lookup map or function.
 */
export function computeSuperinvestorOverlap(
  holdings: ScreenHoldingInput[],
  cusipToSymbol: Map<string, string> | ((cusip: string) => string | undefined)
): SuperinvestorOverlapResult[] {
  const resolveSymbol =
    typeof cusipToSymbol === "function"
      ? cusipToSymbol
      : (cusip: string) => cusipToSymbol.get(cusip);

  // 1. Filter and map holdings to symbols
  const mappedHoldings = holdings
    .map((h) => ({ ...h, symbol: resolveSymbol(h.cusip) }))
    .filter((h): h is typeof h & { symbol: string } => h.symbol !== undefined && h.symbol !== "");

  if (mappedHoldings.length === 0) {
    return [];
  }

  // 2. Compute per-filer latest and previous periods of report
  const filers = new Set(mappedHoldings.map((h) => h.filerCik));
  const filerPeriods = new Map<string, { latest: string; prev?: string }>();

  for (const filerCik of filers) {
    const periods = Array.from(
      new Set(
        mappedHoldings
          .filter((h) => h.filerCik === filerCik)
          .map((h) => h.periodOfReport)
      )
    ).sort();

    if (periods.length > 0) {
      const latest = periods[periods.length - 1];
      const prev = periods.length > 1 ? periods[periods.length - 2] : undefined;
      filerPeriods.set(filerCik, { latest, prev });
    }
  }

  // 3. Group current holdings by symbol (only keeping the latest filings for each filer)
  const symbolLatestHoldings = new Map<string, typeof mappedHoldings>();

  for (const h of mappedHoldings) {
    const fp = filerPeriods.get(h.filerCik);
    if (fp && h.periodOfReport === fp.latest) {
      const list = symbolLatestHoldings.get(h.symbol) ?? [];
      list.push(h);
      symbolLatestHoldings.set(h.symbol, list);
    }
  }

  // 4. Construct overlap result for each symbol
  const results: SuperinvestorOverlapResult[] = [];

  for (const [symbol, latestList] of symbolLatestHoldings.entries()) {
    // Unique holders by CIK for the latest quarter
    const holdersMap = new Map<string, SuperinvestorHolder>();
    for (const h of latestList) {
      const existing = holdersMap.get(h.filerCik);
      if (existing) {
        // Aggregate if duplicate rows exist for same filer/cusip/symbol in latest period
        existing.shares += h.shares;
        existing.value += h.value;
      } else {
        holdersMap.set(h.filerCik, {
          name: h.filerName,
          shares: h.shares,
          value: h.value,
        });
      }
    }

    const holders = Array.from(holdersMap.values());
    const holderCount = holders.length;

    // Determine newThisQuarter: true if at least one filer holds it in their latest period,
    // but did not hold it in their previous period (and they had other holdings in their previous period).
    let newThisQuarter = false;

    for (const h of latestList) {
      const fp = filerPeriods.get(h.filerCik);
      if (fp && fp.prev) {
        // Did this filer hold the symbol in the previous period?
        const heldInPrev = mappedHoldings.some(
          (prevH) =>
            prevH.filerCik === h.filerCik &&
            prevH.symbol === symbol &&
            prevH.periodOfReport === fp.prev
        );

        if (!heldInPrev) {
          // Double check if filer had ANY holdings in the previous period (to verify history is present)
          const hadAnyHistory = mappedHoldings.some(
            (prevH) => prevH.filerCik === h.filerCik && prevH.periodOfReport === fp.prev
          );
          if (hadAnyHistory) {
            newThisQuarter = true;
            break;
          }
        }
      }
    }

    results.push({
      symbol,
      holders,
      holderCount,
      newThisQuarter,
    });
  }

  return results.sort((a, b) => b.holderCount - a.holderCount || a.symbol.localeCompare(b.symbol));
}
