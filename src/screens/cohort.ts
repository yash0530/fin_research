export type CohortRow = {
  symbol: string;
  sectorCode: string;
  evToEbit: number | null | undefined;
};

export type CohortResult = {
  cheap: Set<string>;
  warnings: string[];
};

export function screenApplicability(sectorCodes: string[]): { applicable: boolean; reason?: string } {
  if (sectorCodes.includes("g_financials") || sectorCodes.includes("g_real_estate")) {
    return { applicable: false, reason: "Financials/REITs are excluded from this screen" };
  }
  return { applicable: true };
}

export function computeCohortCheapness(rows: CohortRow[]): CohortResult {
  const warnings: string[] = [];
  const cheap = new Set<string>();

  // Group by sector
  const groups = new Map<string, CohortRow[]>();
  for (const r of rows) {
    if (!groups.has(r.sectorCode)) {
      groups.set(r.sectorCode, []);
    }
    groups.get(r.sectorCode)!.push(r);
  }

  // Process each sector
  for (const [sectorCode, sectorRows] of groups.entries()) {
    if (sectorRows.length < 10) {
      warnings.push(`sector ${sectorCode} cohort has <10 names`);
    }

    // Filter valid evToEbit values
    const validRows = sectorRows.filter(
      (r) => r.evToEbit !== null && r.evToEbit !== undefined && Number.isFinite(r.evToEbit)
    );

    // Sort by evToEbit ascending, with symbol as tie breaker
    validRows.sort((a, b) => {
      const diff = (a.evToEbit as number) - (b.evToEbit as number);
      if (diff !== 0) return diff;
      return a.symbol.localeCompare(b.symbol);
    });

    const N = validRows.length;
    const limit = Math.floor(N * 0.25);

    for (let i = 0; i < limit; i++) {
      cheap.add(validRows[i].symbol);
    }
  }

  return {
    cheap,
    warnings,
  };
}
