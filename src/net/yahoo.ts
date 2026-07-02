// Yahoo Finance response parsing. The live fetch is a thin wrapper; the PARSING
// (unix timestamps → YYYY-MM-DD, null-close filtering, quote-batch extraction) is
// pure and fixture-tested. Port of lib/yahoo.ts's mapping.

export type PriceRow = { symbol: string; d: string; close: number };

export type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: unknown;
  };
};

function isoDateUTC(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

/** Parse a chart() response into despike-ready Price rows (skips null closes). */
export function parseChart(symbol: string, json: YahooChart): PriceRow[] {
  const result = json.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const rows: PriceRow[] = [];
  const sym = symbol.toUpperCase();
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c === null || c === undefined || !Number.isFinite(c)) continue;
    rows.push({ symbol: sym, d: isoDateUTC(ts[i]), close: c });
  }
  return rows;
}

export type QuoteRow = {
  symbol: string;
  price: number | null;
  marketCap: number | null;
  forwardPE: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  beta: number | null;
};

export type YahooQuote = {
  quoteResponse?: {
    result?: Array<{
      symbol: string;
      regularMarketPrice?: number;
      marketCap?: number;
      forwardPE?: number;
      fiftyTwoWeekHigh?: number;
      fiftyTwoWeekLow?: number;
      beta?: number;
    }>;
  };
};

const num = (v: number | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Parse a batched quote() response into per-symbol stat rows. */
export function parseQuoteBatch(json: YahooQuote): QuoteRow[] {
  const results = json.quoteResponse?.result ?? [];
  return results.map((r) => ({
    symbol: r.symbol.toUpperCase(),
    price: num(r.regularMarketPrice),
    marketCap: num(r.marketCap),
    forwardPE: num(r.forwardPE),
    fiftyTwoWeekHigh: num(r.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(r.fiftyTwoWeekLow),
    beta: num(r.beta),
  }));
}
