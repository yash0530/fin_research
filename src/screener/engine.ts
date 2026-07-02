// Full-universe screening over local ticker rows. Port of screener_engine.py:
// field resolvers + operator filters + universe spec. Pure — operates on injected
// rows so it screens the S&P universe in milliseconds with no DB in the test.

export type TickerRow = {
  symbol: string;
  source?: string;
  watchlisted?: boolean;
  gicsCode?: string;
  aiCodes?: string[];
  marketCap?: number | null;
  forwardPE?: number | null;
  trailingPE?: number | null;
  revenueGrowthPct?: number | null;
  profitMarginPct?: number | null;
  beta?: number | null;
  yearChangePct?: number | null;
  rsi?: number | null;
  pctFrom52wHighPct?: number | null;
};

export type UniverseSpec = "sp500" | "ai_infra" | "watchlist" | `sector:${string}`;
export type Operator = "gt" | "gte" | "lt" | "lte" | "eq" | "between";
export type Filter = { field: string; op: Operator; value: number; value2?: number };
export type Sort = { field: string; dir: "asc" | "desc" };
export type ScreenerConfig = {
  universe: UniverseSpec;
  filters: Filter[];
  sort?: Sort;
  limit?: number;
};

// Field resolvers — the screenable metric namespace.
export const RESOLVERS: Record<string, (r: TickerRow) => number | null | undefined> = {
  marketCap: (r) => r.marketCap,
  forwardPE: (r) => r.forwardPE,
  trailingPE: (r) => r.trailingPE,
  revenueGrowthPct: (r) => r.revenueGrowthPct,
  profitMarginPct: (r) => r.profitMarginPct,
  beta: (r) => r.beta,
  yearChangePct: (r) => r.yearChangePct,
  rsi: (r) => r.rsi,
  pctFrom52wHighPct: (r) => r.pctFrom52wHighPct,
};

export function screenableFields(): string[] {
  return Object.keys(RESOLVERS).sort();
}

function inUniverse(row: TickerRow, spec: UniverseSpec): boolean {
  if (spec === "sp500") return true; // the injected rows ARE the S&P universe
  if (spec === "ai_infra") return (row.aiCodes?.length ?? 0) > 0;
  if (spec === "watchlist") return row.watchlisted === true;
  if (spec.startsWith("sector:")) {
    const code = spec.slice("sector:".length);
    return row.gicsCode === code || (row.aiCodes?.includes(code) ?? false);
  }
  return false;
}

function passesFilter(row: TickerRow, f: Filter): boolean {
  const resolver = RESOLVERS[f.field];
  if (!resolver) return false; // unknown field never matches
  const v = resolver(row);
  if (v === null || v === undefined || !Number.isFinite(v)) return false; // missing data excluded
  switch (f.op) {
    case "gt":
      return v > f.value;
    case "gte":
      return v >= f.value;
    case "lt":
      return v < f.value;
    case "lte":
      return v <= f.value;
    case "eq":
      return v === f.value;
    case "between":
      return f.value2 !== undefined && v >= f.value && v <= f.value2;
    default:
      return false;
  }
}

export type ScreenResult = {
  matched: TickerRow[];
  scanned: number;
  matchedCount: number;
};

export function runScreen(rows: TickerRow[], config: ScreenerConfig): ScreenResult {
  const universe = rows.filter((r) => inUniverse(r, config.universe));
  let matched = universe.filter((r) => config.filters.every((f) => passesFilter(r, f)));

  if (config.sort) {
    const { field, dir } = config.sort;
    const resolver = RESOLVERS[field];
    if (resolver) {
      matched = [...matched].sort((a, b) => {
        const av = resolver(a);
        const bv = resolver(b);
        const an = av === null || av === undefined || !Number.isFinite(av) ? -Infinity : av;
        const bn = bv === null || bv === undefined || !Number.isFinite(bv) ? -Infinity : bv;
        return dir === "asc" ? an - bn : bn - an;
      });
    }
  }
  if (config.limit !== undefined) matched = matched.slice(0, config.limit);

  return { matched, scanned: universe.length, matchedCount: matched.length };
}
