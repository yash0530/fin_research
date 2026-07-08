// Hyperscaler capex scorecard — pure math over injected quarterly capex rows for
// MSFT / AMZN / GOOGL / META (v1 signal #9). TTM capex + YoY growth per name and
// combined, plus a quarterly series for sparklines. Capex signs are normalized to
// positive spend (cash-flow statements report it negative). Null quarters produce
// warnings, never silent zeros — data-quality chips render from `warnings`.

export const HYPERSCALERS = ["MSFT", "AMZN", "GOOGL", "META"] as const;

export type CapexQuarterRow = {
  periodEnd: string; // YYYY-MM-DD
  capex: number | null;
};

export type CapexName = {
  symbol: string;
  /** TTM capex (last 4 quarters, positive $). null when any quarter missing. */
  ttmCapex: number | null;
  /** YoY TTM growth % (vs quarters 5–8). null when either window incomplete. */
  yoyGrowthPct: number | null;
  /** Up to the last 12 quarters, oldest first, for the sparkline (positive $). */
  quarterly: { periodEnd: string; capex: number | null }[];
  warnings: string[];
};

export type CapexScorecard = {
  names: CapexName[];
  /** Sum of complete per-name TTMs. null when NO name has a complete TTM. */
  combinedTtm: number | null;
  /** Combined YoY % — only when every name has both TTM windows. */
  combinedYoyPct: number | null;
  warnings: string[];
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Sum a window of quarters; null if any capex value in the window is missing. */
function windowSum(rows: CapexQuarterRow[], start: number, end: number): number | null {
  const slice = rows.slice(start, end);
  if (slice.length < end - start) return null;
  let sum = 0;
  for (const q of slice) {
    if (q.capex === null || q.capex === undefined) return null;
    sum += Math.abs(q.capex);
  }
  return sum;
}

export function computeCapexName(symbol: string, quarters: CapexQuarterRow[]): CapexName {
  const warnings: string[] = [];
  // Chronological, deduped by periodEnd (keep the row with a capex value).
  const byPeriod = new Map<string, CapexQuarterRow>();
  for (const q of quarters) {
    const existing = byPeriod.get(q.periodEnd);
    if (!existing || (existing.capex === null && q.capex !== null)) {
      byPeriod.set(q.periodEnd, q);
    }
  }
  const sorted = Array.from(byPeriod.values()).sort((a, b) =>
    a.periodEnd.localeCompare(b.periodEnd),
  );

  const n = sorted.length;
  const ttmCapex = n >= 4 ? windowSum(sorted, n - 4, n) : null;
  const priorTtm = n >= 8 ? windowSum(sorted, n - 8, n - 4) : null;

  if (n < 4) warnings.push(`${symbol}: only ${n} quarters — TTM capex unavailable`);
  else if (ttmCapex === null) warnings.push(`${symbol}: capex missing in a TTM quarter`);
  if (n >= 4 && ttmCapex !== null && (n < 8 || priorTtm === null)) {
    warnings.push(`${symbol}: prior-year TTM incomplete — YoY growth unavailable`);
  }

  const yoyGrowthPct =
    ttmCapex !== null && priorTtm !== null && priorTtm > 0
      ? round1(((ttmCapex - priorTtm) / priorTtm) * 100)
      : null;

  const quarterly = sorted.slice(-12).map((q) => ({
    periodEnd: q.periodEnd,
    capex: q.capex === null || q.capex === undefined ? null : Math.abs(q.capex),
  }));

  return { symbol, ttmCapex, yoyGrowthPct, quarterly, warnings };
}

/**
 * Full scorecard over injected quarters keyed by symbol. Pure — the caller
 * (web reader / run step) loads the rows; this only does the math.
 */
export function computeCapexScorecard(
  quartersBySymbol: Record<string, CapexQuarterRow[]>,
  symbols: readonly string[] = HYPERSCALERS,
): CapexScorecard {
  const names = symbols.map((s) => computeCapexName(s, quartersBySymbol[s] ?? []));
  const warnings = names.flatMap((n) => n.warnings);

  const complete = names.filter((n) => n.ttmCapex !== null);
  const combinedTtm =
    complete.length > 0 ? complete.reduce((sum, n) => sum + (n.ttmCapex ?? 0), 0) : null;
  if (complete.length > 0 && complete.length < names.length) {
    warnings.push(
      `combined TTM covers ${complete.length}/${names.length} names — partial total`,
    );
  }

  // Combined YoY only when every name has both windows — never a mixed-basis %.
  let combinedYoyPct: number | null = null;
  const withYoy = names.filter((n) => n.yoyGrowthPct !== null && n.ttmCapex !== null);
  if (withYoy.length === names.length) {
    let curr = 0;
    let prior = 0;
    for (const n of withYoy) {
      const ttm = n.ttmCapex!;
      curr += ttm;
      prior += ttm / (1 + n.yoyGrowthPct! / 100);
    }
    if (prior > 0) combinedYoyPct = round1(((curr - prior) / prior) * 100);
  }

  return { names, combinedTtm, combinedYoyPct, warnings };
}
