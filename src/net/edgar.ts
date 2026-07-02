import { RateLimiter } from "./rate-limiter";

// EDGAR helpers. `requireUserAgent` enforces the descriptive UA SEC demands (at
// startup). `EDGAR_LIMITER` is the ONE shared 8 req/s bucket every EDGAR caller
// must use. `parseSubmissions` turns the data.sec.gov submissions JSON into typed
// filing rows — pure, so it's tested against a fixture with no network.

export const EDGAR_LIMITER = new RateLimiter(8);

export const EDGAR_FORMS_OF_INTEREST = ["10-K", "10-Q", "8-K", "4", "DEF 14A"];

export function requireUserAgent(env: Record<string, string | undefined> = process.env): string {
  const ua = env.EDGAR_USER_AGENT?.trim();
  if (!ua) {
    throw new Error(
      "EDGAR_USER_AGENT is required — a descriptive 'Name email@example.com' string (see .env.example)",
    );
  }
  return ua;
}

export type EdgarFilingRow = {
  accessionNo: string;
  symbol: string;
  cik: string;
  form: string;
  filedAt: string; // YYYY-MM-DD
  primaryDoc: string | null;
};

type SubmissionsJson = {
  filings?: {
    recent?: {
      accessionNumber?: string[];
      form?: string[];
      filingDate?: string[];
      primaryDocument?: string[];
    };
  };
};

/** Parse EDGAR submissions JSON into filing rows, filtered to forms of interest. */
export function parseSubmissions(
  cik: string,
  symbol: string,
  json: SubmissionsJson,
  forms: string[] = EDGAR_FORMS_OF_INTEREST,
): EdgarFilingRow[] {
  const recent = json.filings?.recent;
  if (!recent?.accessionNumber || !recent.form) return [];
  const keep = new Set(forms);
  const rows: EdgarFilingRow[] = [];
  const n = recent.accessionNumber.length;
  for (let i = 0; i < n; i++) {
    const form = recent.form[i];
    if (!keep.has(form)) continue;
    rows.push({
      accessionNo: recent.accessionNumber[i],
      symbol: symbol.toUpperCase(),
      cik,
      form,
      filedAt: recent.filingDate?.[i] ?? "",
      primaryDoc: recent.primaryDocument?.[i] ?? null,
    });
  }
  return rows;
}
