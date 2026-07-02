import { parseChart, type PriceRow } from "./yahoo";
import { parseSubmissions, EDGAR_LIMITER, type EdgarFilingRow } from "./edgar";
import type { RateLimiter } from "./rate-limiter";

// Live fetch wrappers. The fetcher is injected so these are unit-testable with
// canned responses — only the actual network endpoint is unverifiable (external).
// EDGAR calls go through the shared 8 req/s limiter with a descriptive User-Agent.

export type HttpResponse = { ok: boolean; status: number; text: () => Promise<string> };
export type Fetcher = (url: string, init?: { headers?: Record<string, string> }) => Promise<HttpResponse>;

export async function fetchChart(
  symbol: string,
  fetchImpl: Fetcher,
  opts: { range?: string; interval?: string } = {},
): Promise<PriceRow[]> {
  const range = opts.range ?? "10y";
  const interval = opts.interval ?? "1d";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`yahoo chart ${symbol}: HTTP ${res.status}`);
  return parseChart(symbol, JSON.parse(await res.text()));
}

export async function fetchSubmissions(
  cik: string,
  symbol: string,
  fetchImpl: Fetcher,
  userAgent: string,
  limiter: RateLimiter = EDGAR_LIMITER,
  sleep?: (ms: number) => Promise<void>,
): Promise<EdgarFilingRow[]> {
  const padded = cik.replace(/\D/g, "").padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  const res = await limiter.throttle(
    () => fetchImpl(url, { headers: { "User-Agent": userAgent, "Accept-Encoding": "gzip" } }),
    sleep,
  );
  if (!res.ok) throw new Error(`EDGAR submissions ${padded}: HTTP ${res.status}`);
  return parseSubmissions(padded, symbol, JSON.parse(await res.text()));
}
