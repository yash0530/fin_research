import { despike } from "../lib/metrics";

export type Bar = { d: string; close: number };

/**
 * Computes forward return percentage after despiking closes.
 * Finds the close on or nearest-before fromD (start) and the close
 * nearest-on-or-after fromD + horizonDays (end).
 * Returns (end - start) / start * 100, or null if either is missing.
 * NEVER reads a bar the caller didn't pass.
 */
export function forwardReturnPct(bars: Bar[], fromD: string, horizonDays: number): number | null {
  if (bars.length === 0) return null;

  // Sort bars by date ascending to ensure correct nearest searches
  const sortedBars = [...bars].sort((a, b) => a.d.localeCompare(b.d));
  
  // Extract and despike closes
  const rawCloses = sortedBars.map((b) => b.close);
  const despikedCloses = despike(rawCloses);

  // Find start bar: on or nearest-before fromD
  let startIdx = -1;
  for (let i = 0; i < sortedBars.length; i++) {
    if (sortedBars[i].d <= fromD) {
      startIdx = i;
    }
  }

  if (startIdx === -1) return null;

  // Compute end date string
  const fromDate = new Date(`${fromD}T00:00:00Z`);
  if (isNaN(fromDate.getTime())) return null;

  const targetDateMs = fromDate.getTime() + horizonDays * 86_400_000;
  const targetDate = new Date(targetDateMs);
  const yearStr = String(targetDate.getUTCFullYear());
  const monthStr = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
  const dayStr = String(targetDate.getUTCDate()).padStart(2, "0");
  const targetD = `${yearStr}-${monthStr}-${dayStr}`;

  // Find end bar: nearest-on-or-after targetD
  let endIdx = -1;
  for (let i = 0; i < sortedBars.length; i++) {
    if (sortedBars[i].d >= targetD) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) return null;

  const startPrice = despikedCloses[startIdx];
  const endPrice = despikedCloses[endIdx];

  if (startPrice === 0 || !Number.isFinite(startPrice) || !Number.isFinite(endPrice)) {
    return null;
  }

  return ((endPrice - startPrice) / startPrice) * 100;
}

/**
 * Returns calendar month-end dates (YYYY-MM-DD) from start to end inclusive.
 */
export function monthEndGrid(startISO: string, endISO: string): string[] {
  if (startISO > endISO) return [];
  const startParts = startISO.split("-").map(Number);
  const endParts = endISO.split("-").map(Number);
  if (startParts.length < 3 || endParts.length < 3) return [];

  const startYear = startParts[0];
  const startMonth = startParts[1] - 1; // 0-indexed
  const endYear = endParts[0];
  const endMonth = endParts[1] - 1; // 0-indexed

  const grid: string[] = [];

  let currYear = startYear;
  let currMonth = startMonth;

  while (true) {
    if (currYear > endYear || (currYear === endYear && currMonth > endMonth)) {
      break;
    }

    // Get last day of currMonth
    const lastDay = new Date(Date.UTC(currYear, currMonth + 1, 0));
    const yearStr = String(lastDay.getUTCFullYear());
    const monthStr = String(lastDay.getUTCMonth() + 1).padStart(2, "0");
    const dayStr = String(lastDay.getUTCDate()).padStart(2, "0");
    const formatted = `${yearStr}-${monthStr}-${dayStr}`;

    if (formatted >= startISO && formatted <= endISO) {
      grid.push(formatted);
    }

    currMonth++;
    if (currMonth > 11) {
      currMonth = 0;
      currYear++;
    }
  }

  return grid;
}

/** Alias for monthEndGrid expected by job/backtest.ts */
export const monthEnds = monthEndGrid;

/**
 * Computes mean of number array. Returns 0 on empty.
 */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) {
    sum += x;
  }
  return sum / xs.length;
}

export interface ScoreResult {
  n: number;
  flaggedMean: number;
  baselineMean: number;
  excess: number;
  hitRate: number;
  flaggedMeanPct: number | null;
  baselineMeanPct: number | null;
  excessPct: number | null;
}

/**
 * Scores a signal against a baseline. Supports two signatures:
 * 1. scoreSignal(flaggedReturns: number[], baselineMean: number)
 * 2. scoreSignal(flaggedSymbols: string[], eligibleUniverse: string[], fwdReturnsMap: Map<string, number>)
 */
export function scoreSignal(
  flaggedReturns: number[],
  baselineMean: number,
): ScoreResult;

export function scoreSignal(
  flaggedSymbols: string[],
  eligibleUniverse: string[],
  fwdReturnsMap: Map<string, number>,
): ScoreResult;

export function scoreSignal(
  arg1: number[] | string[],
  arg2: number | string[],
  arg3?: Map<string, number>,
): ScoreResult {
  if (arg3 instanceof Map) {
    const flagged = arg1 as string[];
    const eligibleUniverse = arg2 as string[];
    const fwdReturnsMap = arg3;

    const flaggedReturns = flagged
      .map((sym) => fwdReturnsMap.get(sym))
      .filter((v): v is number => typeof v === "number");

    const baselineReturns = eligibleUniverse
      .map((sym) => fwdReturnsMap.get(sym))
      .filter((v): v is number => typeof v === "number");

    const flaggedMean = flaggedReturns.length > 0 ? mean(flaggedReturns) : null;
    const baselineMean = baselineReturns.length > 0 ? mean(baselineReturns) : null;
    const excess = (flaggedMean !== null && baselineMean !== null) ? flaggedMean - baselineMean : null;

    let hitRate = 0;
    if (baselineMean !== null && flaggedReturns.length > 0) {
      const greaterCount = flaggedReturns.filter((r) => r > baselineMean).length;
      hitRate = greaterCount / flaggedReturns.length;
    }

    return {
      n: flaggedReturns.length,
      flaggedMean: flaggedMean ?? 0,
      baselineMean: baselineMean ?? 0,
      flaggedMeanPct: flaggedMean,
      baselineMeanPct: baselineMean,
      excess: excess ?? 0,
      excessPct: excess,
      hitRate,
    };
  } else {
    const flaggedReturns = arg1 as number[];
    const baselineMean = arg2 as number;
    const n = flaggedReturns.length;
    if (n === 0) {
      return {
        n: 0,
        flaggedMean: 0,
        baselineMean,
        excess: -baselineMean,
        hitRate: 0,
        flaggedMeanPct: 0,
        baselineMeanPct: baselineMean,
        excessPct: -baselineMean,
      };
    }
    const flaggedMean = mean(flaggedReturns);
    const excess = flaggedMean - baselineMean;
    const greaterCount = flaggedReturns.filter((r) => r > baselineMean).length;
    const hitRate = greaterCount / n;

    return {
      n,
      flaggedMean,
      baselineMean,
      excess,
      hitRate,
      flaggedMeanPct: flaggedMean,
      baselineMeanPct: baselineMean,
      excessPct: excess,
    };
  }
}
