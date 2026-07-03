import type { SqlDb } from "../db/migrate";
import { despike } from "../lib/metrics";

export type Bar = { d: string; close: number };

export type SplitFinding = {
  date: string;
  ratio: number;
  factor: number;
};

export type FlatRunFinding = {
  startDate: string;
  endDate: string;
  length: number;
  close: number;
};

export type GapFinding = {
  startDate: string;
  endDate: string;
  gapDays: number;
};

const SIMPLE_FACTORS = [10, 7, 5, 4, 3, 2, 0.5, 1 / 3, 0.25, 0.2, 1 / 7, 0.1];

/**
 * Guesses the split factor by finding the nearest simple ratio to the inverse of the change ratio.
 */
export function guessSplitFactor(ratio: number): number {
  const target = 1 / ratio;
  let bestFactor = 1;
  let minDiff = Infinity;
  for (const f of SIMPLE_FACTORS) {
    const diff = Math.abs(Math.log(target) - Math.log(f));
    if (diff < minDiff) {
      minDiff = diff;
      bestFactor = f;
    }
  }
  return bestFactor;
}

/**
 * Detects potential unadjusted stock splits where adjacent-day ratio is outside [0.55, 1.8]
 * and the price does not recover the next day.
 */
export function splitSuspects(bars: Bar[]): SplitFinding[] {
  const findings: SplitFinding[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const curr = bars[i].close;
    if (prev === 0) continue;
    const ratio = curr / prev;
    if (ratio < 0.55 || ratio > 1.8) {
      if (i + 1 < bars.length) {
        const next = bars[i + 1].close;
        const recoverRatio = next / prev;
        // If recovered, recoverRatio is close to 1.0 (between 0.75 and 1.33)
        if (recoverRatio >= 0.75 && recoverRatio <= 1.33) {
          continue;
        }
      }
      if (i - 2 >= 0) {
        const prevPrev = bars[i - 2].close;
        if (prevPrev > 0) {
          const prevRatio = prev / prevPrev;
          if (prevRatio < 0.55 || prevRatio > 1.8) {
            const recoverRatio = curr / prevPrev;
            if (recoverRatio >= 0.75 && recoverRatio <= 1.33) {
              continue;
            }
          }
        }
      }
      findings.push({
        date: bars[i].d,
        ratio,
        factor: guessSplitFactor(ratio),
      });
    }
  }
  return findings;
}

/**
 * Detects runs of minLen or more days of identical close prices.
 */
export function flatRuns(bars: Bar[], minLen = 15): FlatRunFinding[] {
  const findings: FlatRunFinding[] = [];
  if (bars.length < minLen) return [];
  let runStart = 0;
  for (let i = 1; i <= bars.length; i++) {
    if (i === bars.length || bars[i].close !== bars[runStart].close) {
      const runLen = i - runStart;
      if (runLen >= minLen) {
        findings.push({
          startDate: bars[runStart].d,
          endDate: bars[i - 1].d,
          length: runLen,
          close: bars[runStart].close,
        });
      }
      runStart = i;
    }
  }
  return findings;
}

/**
 * Helper to calculate the calendar days between two ISO string dates (YYYY-MM-DD).
 */
export function getCalendarDaysDiff(d1: string, d2: string): number {
  const t1 = Date.parse(d1);
  const t2 = Date.parse(d2);
  const diffMs = Math.abs(t2 - t1);
  return Math.round(diffMs / 86_400_000);
}

/**
 * Detects calendar gaps between consecutive bars beyond maxGapDays.
 */
export function gaps(bars: Bar[], maxGapDays = 10): GapFinding[] {
  const findings: GapFinding[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prevDate = bars[i - 1].d;
    const currDate = bars[i].d;
    const diff = getCalendarDaysDiff(prevDate, currDate);
    if (diff > maxGapDays) {
      findings.push({
        startDate: prevDate,
        endDate: currDate,
        gapDays: diff,
      });
    }
  }
  return findings;
}

/**
 * Core runner for the integrity_check job.
 * Scans every specified symbol's full price history.
 * Never mutates data. Never throws.
 */
export async function runIntegrityJob(db: SqlDb, symbols: string[]): Promise<string> {
  let totalSplits = 0;
  let totalFlats = 0;
  let totalGaps = 0;
  const splitSymbols = new Set<string>();
  const splitOffenders: { symbol: string; date: string; ratio: number; factor: number }[] = [];

  for (const symbol of symbols) {
    try {
      const rows = db
        .prepare('SELECT "d", "close" FROM "Price" WHERE "symbol"=? ORDER BY "d" ASC')
        .all(symbol.toUpperCase()) as Bar[];

      if (rows.length === 0) continue;

      // 1. Split detection: must run on RAW closes
      const splits = splitSuspects(rows);
      if (splits.length > 0) {
        totalSplits += splits.length;
        splitSymbols.add(symbol);
        for (const s of splits) {
          splitOffenders.push({ symbol, date: s.date, ratio: s.ratio, factor: s.factor });
        }
      }

      // 2. Flat runs & gaps: despiked read is fine/preferred
      const rawCloses = rows.map((r) => r.close);
      const despikedCloses = despike(rawCloses);
      const despikedRows = rows.map((r, idx) => ({ d: r.d, close: despikedCloses[idx] }));

      const flats = flatRuns(despikedRows);
      totalFlats += flats.length;

      const gapList = gaps(despikedRows);
      totalGaps += gapList.length;
    } catch (e) {
      console.error(`Error checking integrity for ${symbol}:`, e);
    }
  }

  // Sort split offenders to find the "worst" offenders (largest deviation from 1.0 split factor)
  splitOffenders.sort((a, b) => {
    const devA = Math.max(a.factor, 1 / a.factor);
    const devB = Math.max(b.factor, 1 / b.factor);
    return devB - devA;
  });

  if (splitOffenders.length > 0) {
    console.log("Worst split-suspect offenders:");
    for (const off of splitOffenders.slice(0, 10)) {
      console.log(`  ${off.symbol}: date=${off.date}, ratio=${off.ratio.toFixed(4)}, factor=${off.factor}`);
    }
  }

  return `${symbols.length} symbols, ${totalSplits} split-suspects across ${splitSymbols.size} symbols, ${totalFlats} flat-runs, ${totalGaps} gaps`;
}
