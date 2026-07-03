import { GICS_NAME_TO_CODE } from "../config/sectors";

// Loads the S&P universe CSV (ticker/company/sector/industry) and maps each row's
// GICS sector name to our g_* code. Pure — takes the CSV text, returns rows.
// Port of the universe → g_* mapping step in the seed.

export type UniverseRow = {
  symbol: string;
  name: string;
  sector: string;
  industry?: string;
  gicsCode: string | null; // null = unmapped sector name (flag in seed)
};

/** Minimal RFC-4180-ish line splitter handling quoted fields with embedded commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseUniverseCsv(csv: string): UniverseRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]): number => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const tIdx = col("ticker", "symbol");
  const cIdx = col("company_name", "company", "name");
  const sIdx = col("sector", "gics sector");
  const iIdx = col("industry", "gics sub-industry");
  if (tIdx < 0 || sIdx < 0) return [];

  const rows: UniverseRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = splitCsvLine(lines[i]);
    const symbol = (cols[tIdx] ?? "").trim().toUpperCase();
    if (!symbol) continue;
    const sector = (cols[sIdx] ?? "").trim();
    rows.push({
      symbol,
      name: cIdx >= 0 ? (cols[cIdx] ?? "").trim() : "",
      sector,
      industry: iIdx >= 0 ? (cols[iIdx] ?? "").trim() : undefined,
      gicsCode: GICS_NAME_TO_CODE[sector] ?? null,
    });
  }
  return rows;
}

/** Count constituents per GICS code (unmapped rows keyed as "unmapped"). */
export function countByGics(rows: UniverseRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const key = r.gicsCode ?? "unmapped";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export type UniverseSummary = {
  total: number;
  mapped: number;
  unmapped: number;
  sectors: number; // distinct g_* codes present
  byGics: Record<string, number>;
};

/** Roll-up used by the seed's console summary and the CSV integrity test. */
export function summarizeUniverse(rows: UniverseRow[]): UniverseSummary {
  const byGics = countByGics(rows);
  const mapped = rows.filter((r) => r.gicsCode !== null).length;
  const sectors = Object.keys(byGics).filter((k) => k !== "unmapped").length;
  return {
    total: rows.length,
    mapped,
    unmapped: rows.length - mapped,
    sectors,
    byGics,
  };
}
