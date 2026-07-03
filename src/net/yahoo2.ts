// yahoo-finance2 transport (the DECISION in docs/research/market-scan.md: naive
// Yahoo fetch is 429-throttled from this IP; yahoo-finance2 carries the cookie/crumb
// dance for us). This is a THIN adapter: each function maps yahoo-finance2's rich
// result into OUR row types, tags `source: "yahoo2"`, and NEVER throws — on any
// failure it returns `[] / null` plus an `error` string. The client is injected
// (default = a silent singleton) so every test drives it with a fake, no network.
//
// The pure MAPPERS (mapChartToBars, mapQuoteBatch, mapFundamentals, mapQuoteStats,
// mapEarnings) are exported and fixture-tested; the fetch wrappers just call the
// client and hand the raw result to a mapper inside a try/catch.

import YahooFinance from "yahoo-finance2";

export const YAHOO2_SOURCE = "yahoo2";

// ── Our row types ────────────────────────────────────────────────────────────

export type DailyBar = { symbol: string; d: string; close: number; volume: number | null; source: string };

export type QuoteStat = {
  symbol: string;
  price: number | null;
  marketCap: number | null;
  forwardPE: number | null;
  trailingPE: number | null;
  profitMargin: number | null;
  revenueGrowth: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  beta: number | null;
  eps: number | null;
  yearChange: number | null;
  source: string;
};

export type FundamentalsRow = {
  symbol: string;
  periodEnd: string; // YYYY-MM-DD
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  fcf: number | null;
  capex: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  cash: number | null;
  equity: number | null;
  sharesOut: number | null;
  source: string;
};

export type EarningsDate = { symbol: string; d: string; source: string };

export type FetchResult<T> = { rows: T[]; error: string | null };
export type StatResult = { stats: QuoteStat | null; error: string | null };

// ── Injectable client (subset of yahoo-finance2's surface we use) ────────────

export interface Yahoo2Client {
  chart(
    symbol: string,
    opts: { period1: Date | string; period2?: Date | string; interval?: string },
  ): Promise<{ quotes: Array<{ date: Date; close: number | null; adjclose?: number | null; volume: number | null }> }>;
  quote(symbols: string[]): Promise<Array<Record<string, unknown>>>;
  quoteSummary(symbol: string, opts: { modules: string[] }): Promise<Record<string, unknown>>;
  fundamentalsTimeSeries(
    symbol: string,
    opts: { period1: Date | string; period2?: Date | string; type: string; module: string },
  ): Promise<Array<Record<string, unknown>>>;
}

const SILENT = (): void => {};

let _client: Yahoo2Client | null = null;

/** A process-wide silent yahoo-finance2 instance (suppresses schema-validation noise). */
export function defaultClient(): Yahoo2Client {
  if (!_client) {
    const Ctor = YahooFinance as unknown as new (opts?: unknown) => Yahoo2Client;
    _client = new Ctor({
      logger: { info: SILENT, warn: SILENT, error: SILENT, debug: SILENT, dir: SILENT },
      validation: { logErrors: false, logOptionsErrors: false },
      suppressNotices: ["yahooSurvey", "ripHistorical"],
      versionCheck: false,
    });
  }
  return _client;
}

// ── small helpers ─────────────────────────────────────────────────────────────

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function isoDate(d: Date | string | number | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  const date = d instanceof Date ? d : new Date(d);
  const t = date.getTime();
  return Number.isFinite(t) ? date.toISOString().slice(0, 10) : null;
}

function pick(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = finite(obj[k]);
    if (v !== null) return v;
  }
  return null;
}

const errStr = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Bounded-concurrency map — reused by the batch jobs to stay polite. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const conc = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, () => worker()));
  return results;
}

// ── Pure mappers ──────────────────────────────────────────────────────────────

/** chart() → despike-ready Price bars (skips null closes). */
export function mapChartToBars(
  symbol: string,
  result: { quotes?: Array<{ date: Date; close: number | null; adjclose?: number | null; volume?: number | null }> },
): DailyBar[] {
  const sym = symbol.toUpperCase();
  const out: DailyBar[] = [];
  for (const q of result.quotes ?? []) {
    const close = finite(q.adjclose) ?? finite(q.close);
    const d = isoDate(q.date);
    if (close === null || d === null) continue;
    out.push({ symbol: sym, d, close, volume: finite(q.volume), source: YAHOO2_SOURCE });
  }
  return out;
}

/** quote([...]) → per-symbol stat rows. */
export function mapQuoteBatch(quotes: Array<Record<string, unknown>>): QuoteStat[] {
  return quotes
    .filter((q) => typeof q.symbol === "string")
    .map((q) => ({
      symbol: String(q.symbol).toUpperCase(),
      price: pick(q, ["regularMarketPrice"]),
      marketCap: pick(q, ["marketCap"]),
      forwardPE: pick(q, ["forwardPE"]),
      trailingPE: pick(q, ["trailingPE"]),
      profitMargin: pick(q, ["profitMargins", "profitMargin"]),
      revenueGrowth: pick(q, ["revenueGrowth"]),
      fiftyTwoWeekHigh: pick(q, ["fiftyTwoWeekHigh"]),
      fiftyTwoWeekLow: pick(q, ["fiftyTwoWeekLow"]),
      beta: pick(q, ["beta"]),
      eps: pick(q, ["epsTrailingTwelveMonths", "epsCurrentYear"]),
      yearChange: pick(q, ["fiftyTwoWeekChangePercent"]),
      source: YAHOO2_SOURCE,
    }));
}

// fundamentalsTimeSeries returns one entry per (statement,date); we merge every
// entry sharing a period end so the balance-sheet / income / cash-flow fields land
// on one row. Candidate key lists cover yahoo's naming variants.
const F_FIELDS: Record<keyof Omit<FundamentalsRow, "symbol" | "periodEnd" | "source">, string[]> = {
  revenue: ["totalRevenue", "operatingRevenue"],
  grossProfit: ["grossProfit"],
  operatingIncome: ["operatingIncome", "totalOperatingIncomeAsReported"],
  netIncome: ["netIncome", "netIncomeCommonStockholders"],
  fcf: ["freeCashFlow"],
  capex: ["capitalExpenditure"],
  totalAssets: ["totalAssets"],
  totalDebt: ["totalDebt", "netDebt"],
  cash: ["cashAndCashEquivalents", "cashCashEquivalentsAndShortTermInvestments"],
  equity: ["stockholdersEquity", "totalEquityGrossMinorityInterest", "commonStockEquity"],
  sharesOut: ["shareIssued", "ordinarySharesNumber", "basicAverageShares"],
};

/** fundamentalsTimeSeries() → merged per-quarter fundamentals rows. */
export function mapFundamentals(symbol: string, entries: Array<Record<string, unknown>>): FundamentalsRow[] {
  const sym = symbol.toUpperCase();
  const byPeriod = new Map<string, FundamentalsRow>();
  for (const entry of entries) {
    const periodEnd = isoDate(entry.date as Date | string | undefined);
    if (!periodEnd) continue;
    let row = byPeriod.get(periodEnd);
    if (!row) {
      row = {
        symbol: sym,
        periodEnd,
        revenue: null,
        grossProfit: null,
        operatingIncome: null,
        netIncome: null,
        fcf: null,
        capex: null,
        totalAssets: null,
        totalDebt: null,
        cash: null,
        equity: null,
        sharesOut: null,
        source: YAHOO2_SOURCE,
      };
      byPeriod.set(periodEnd, row);
    }
    for (const field of Object.keys(F_FIELDS) as (keyof typeof F_FIELDS)[]) {
      if (row[field] === null) {
        const v = pick(entry, F_FIELDS[field]);
        if (v !== null) row[field] = v;
      }
    }
  }
  return Array.from(byPeriod.values()).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
}

/** quoteSummary(defaultKeyStatistics/financialData/summaryDetail) → one stat row. */
export function mapQuoteStats(symbol: string, summary: Record<string, unknown>): QuoteStat {
  const dks = (summary.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const fin = (summary.financialData ?? {}) as Record<string, unknown>;
  const sd = (summary.summaryDetail ?? {}) as Record<string, unknown>;
  return {
    symbol: symbol.toUpperCase(),
    price: pick(fin, ["currentPrice"]) ?? pick(sd, ["previousClose"]),
    marketCap: pick(sd, ["marketCap"]),
    forwardPE: pick(sd, ["forwardPE"]) ?? pick(dks, ["forwardPE"]),
    trailingPE: pick(sd, ["trailingPE"]),
    profitMargin: pick(fin, ["profitMargins"]) ?? pick(dks, ["profitMargins"]),
    revenueGrowth: pick(fin, ["revenueGrowth"]),
    fiftyTwoWeekHigh: pick(sd, ["fiftyTwoWeekHigh"]),
    fiftyTwoWeekLow: pick(sd, ["fiftyTwoWeekLow"]),
    beta: pick(sd, ["beta"]) ?? pick(dks, ["beta"]),
    eps: pick(dks, ["trailingEps"]) ?? pick(fin, ["revenuePerShare"]),
    yearChange: pick(dks, ["52WeekChange"]),
    source: YAHOO2_SOURCE,
  };
}

/** quoteSummary(calendarEvents) → upcoming earnings dates. */
export function mapEarnings(symbol: string, summary: Record<string, unknown>): EarningsDate[] {
  const cal = (summary.calendarEvents ?? {}) as Record<string, unknown>;
  const earnings = (cal.earnings ?? {}) as Record<string, unknown>;
  const dates = (earnings.earningsDate ?? []) as Array<Date | string>;
  const sym = symbol.toUpperCase();
  const seen = new Set<string>();
  const out: EarningsDate[] = [];
  for (const raw of Array.isArray(dates) ? dates : []) {
    const d = isoDate(raw);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push({ symbol: sym, d, source: YAHOO2_SOURCE });
  }
  return out;
}

// ── Fetch wrappers (never throw) ────────────────────────────────────────────

export async function fetchDailyBars(
  symbol: string,
  period1: Date,
  opts: { client?: Yahoo2Client; period2?: Date; interval?: string } = {},
): Promise<FetchResult<DailyBar>> {
  const client = opts.client ?? defaultClient();
  try {
    const result = await client.chart(symbol, {
      period1,
      ...(opts.period2 ? { period2: opts.period2 } : {}),
      interval: opts.interval ?? "1d",
    });
    return { rows: mapChartToBars(symbol, result), error: null };
  } catch (e) {
    return { rows: [], error: `yahoo2 chart ${symbol}: ${errStr(e)}` };
  }
}

/** Batched quote() — chunked to ≤100 symbols per call (Yahoo's cap). */
export async function fetchQuoteBatch(
  symbols: string[],
  opts: { client?: Yahoo2Client; chunkSize?: number } = {},
): Promise<FetchResult<QuoteStat>> {
  const client = opts.client ?? defaultClient();
  const size = Math.min(100, Math.max(1, opts.chunkSize ?? 100));
  const uniq = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  const rows: QuoteStat[] = [];
  const errors: string[] = [];
  for (let i = 0; i < uniq.length; i += size) {
    const batch = uniq.slice(i, i + size);
    try {
      const quotes = await client.quote(batch);
      rows.push(...mapQuoteBatch(Array.isArray(quotes) ? quotes : [quotes as unknown as Record<string, unknown>]));
    } catch (e) {
      errors.push(`yahoo2 quote [${batch[0]}…]: ${errStr(e)}`);
    }
  }
  return { rows, error: errors.length ? errors.join("; ") : null };
}

export async function fetchQuarterlyFundamentals(
  symbol: string,
  opts: { client?: Yahoo2Client; period1?: Date } = {},
): Promise<FetchResult<FundamentalsRow>> {
  const client = opts.client ?? defaultClient();
  const period1 = opts.period1 ?? new Date(Date.now() - 5 * 365 * 86_400_000);
  try {
    const entries = await client.fundamentalsTimeSeries(symbol, {
      period1,
      type: "quarterly",
      module: "all",
    });
    return { rows: mapFundamentals(symbol, Array.isArray(entries) ? entries : []), error: null };
  } catch (e) {
    return { rows: [], error: `yahoo2 fundamentals ${symbol}: ${errStr(e)}` };
  }
}

export async function fetchTickerStats(
  symbol: string,
  opts: { client?: Yahoo2Client } = {},
): Promise<StatResult> {
  const client = opts.client ?? defaultClient();
  try {
    const summary = await client.quoteSummary(symbol, {
      modules: ["defaultKeyStatistics", "financialData", "summaryDetail"],
    });
    return { stats: mapQuoteStats(symbol, summary ?? {}), error: null };
  } catch (e) {
    return { stats: null, error: `yahoo2 quoteSummary ${symbol}: ${errStr(e)}` };
  }
}

export async function fetchEarningsDates(
  symbol: string,
  opts: { client?: Yahoo2Client } = {},
): Promise<FetchResult<EarningsDate>> {
  const client = opts.client ?? defaultClient();
  try {
    const summary = await client.quoteSummary(symbol, { modules: ["calendarEvents"] });
    return { rows: mapEarnings(symbol, summary ?? {}), error: null };
  } catch (e) {
    return { rows: [], error: `yahoo2 calendarEvents ${symbol}: ${errStr(e)}` };
  }
}
