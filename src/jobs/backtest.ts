import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SqlDb } from "../db/migrate";
import { monthEndGrid, forwardReturnPct, scoreSignal, mean, type ScoreResult } from "../backtest/engine";
import { moversAsOf, drawdownFlagsAsOf, latestTradingDayUpTo } from "../backtest/families";
import { activeSymbols, maxPriceDate } from "../db/queries";

export type BacktestOpts = {
  startISO?: string;
  endISO?: string;
  horizons?: { label: string; days: number }[];
};

export type MonthlyFamilyRecord = ScoreResult;

export type MonthlyRecord = {
  asOf: string;
  eligibleCount: number;
  families: Record<string, Record<string, MonthlyFamilyRecord>>;
};

export type AggregateSummaryRow = {
  family: string;
  horizon: string;
  n: number;
  flaggedMeanPct: number;
  baselineMeanPct: number;
  excessPct: number;
  hitRate: number;
};

function getTimestampStr(): string {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const DD = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${YYYY}-${MM}-${DD}-${hh}${mm}${ss}`;
}

function findLastBarOnOrBefore(bars: { d: string; close: number }[], asOf: string): { d: string; close: number } | null {
  let low = 0;
  let high = bars.length - 1;
  let ansIdx = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (bars[mid].d <= asOf) {
      ansIdx = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return ansIdx !== -1 ? bars[ansIdx] : null;
}

function getBarsSpanning(
  allBars: { d: string; close: number }[],
  asOf: string,
  horizonDays: number
): { d: string; close: number }[] {
  let startIdx = -1;
  for (let i = 0; i < allBars.length; i++) {
    if (allBars[i].d <= asOf) {
      startIdx = i;
    }
  }
  if (startIdx === -1) return [];
  return allBars.slice(startIdx);
}

export async function runBacktestJob(db: SqlDb, opts: BacktestOpts = {}): Promise<string> {
  const maxD = maxPriceDate(db);
  if (!maxD) {
    return "backtest: no price data in database, cannot run backtest";
  }

  const startISO = opts.startISO ?? "2010-01-01";
  
  let endISO = opts.endISO;
  if (!endISO) {
    const maxDate = new Date(`${maxD}T00:00:00Z`);
    if (isNaN(maxDate.getTime())) {
      return `backtest: invalid maxPriceDate ${maxD}`;
    }
    const endMs = maxDate.getTime() - 400 * 86_400_000;
    const endDate = new Date(endMs);
    endISO = endDate.toISOString().slice(0, 10);
  }

  const horizons = opts.horizons ?? [
    { label: "21d", days: 21 },
    { label: "63d", days: 63 },
    { label: "126d", days: 126 },
    { label: "252d", days: 252 },
  ];

  const grid = monthEndGrid(startISO, endISO);
  if (grid.length === 0) {
    return `backtest: empty grid between ${startISO} and ${endISO}`;
  }

  // Pre-load all price history into memory to optimize lookups for forwardReturnPct
  const allPrices = db.prepare('SELECT symbol, d, close FROM Price ORDER BY symbol ASC, d ASC').all() as {
    symbol: string;
    d: string;
    close: number;
  }[];

  const priceHistory = new Map<string, { d: string; close: number }[]>();
  for (const p of allPrices) {
    let arr = priceHistory.get(p.symbol);
    if (!arr) {
      arr = [];
      priceHistory.set(p.symbol, arr);
    }
    arr.push({ d: p.d, close: p.close });
  }

  const BENCHMARK_SYMBOLS = new Set(["HYG", "IEF"]);
  const activeList = activeSymbols(db).filter((sym) => !BENCHMARK_SYMBOLS.has(sym));

  const monthlyResults: MonthlyRecord[] = [];

  const accumulatedFlagged = new Map<string, number[]>();
  const accumulatedBaseline = new Map<string, number[]>();
  const families = ["movers_up", "movers_down", "drawdown"];

  for (const family of families) {
    for (const h of horizons) {
      const key = `${family}_${h.label}`;
      accumulatedFlagged.set(key, []);
    }
  }

  for (const h of horizons) {
    accumulatedBaseline.set(h.label, []);
  }

  for (const asOf of grid) {
    try {
      const latestD = latestTradingDayUpTo(db, asOf);
      if (!latestD) continue;

      // Eligible universe at each asOf: active symbols with a bar d<=asOf and last close >= $5.
      const eligibleUniverse: string[] = [];
      for (const sym of activeList) {
        const bars = priceHistory.get(sym);
        if (!bars || bars.length === 0) continue;
        
        const lastBar = findLastBarOnOrBefore(bars, asOf);
        if (!lastBar) continue;
        if (lastBar.close < 5) continue;

        eligibleUniverse.push(sym);
      }

      if (eligibleUniverse.length === 0) continue;

      // Signal extractors
      const movers = moversAsOf(db, asOf, 10);
      const drawdown = drawdownFlagsAsOf(db, asOf, 25, 252);
      
      const moversUpSet = new Set(movers.up);
      const moversDownSet = new Set(movers.down);
      const drawdownSet = new Set(drawdown);

      const monthRecord: MonthlyRecord = {
        asOf,
        eligibleCount: eligibleUniverse.length,
        families: {},
      };

      for (const h of horizons) {
        const horizonReturns: number[] = [];
        const familyReturns: Record<string, number[]> = {
          movers_up: [],
          movers_down: [],
          drawdown: [],
        };

        for (const sym of eligibleUniverse) {
          const bars = priceHistory.get(sym)!;
          const slicedBars = getBarsSpanning(bars, latestD, h.days);
          const ret = forwardReturnPct(slicedBars, latestD, h.days);
          if (ret !== null) {
            horizonReturns.push(ret);

            if (moversUpSet.has(sym)) familyReturns.movers_up.push(ret);
            if (moversDownSet.has(sym)) familyReturns.movers_down.push(ret);
            if (drawdownSet.has(sym)) familyReturns.drawdown.push(ret);
          }
        }

        if (horizonReturns.length === 0) continue;

        const baselineMean = mean(horizonReturns);

        // Accumulate baseline returns for this horizon
        const baseAccum = accumulatedBaseline.get(h.label)!;
        for (const ret of horizonReturns) {
          baseAccum.push(ret);
        }

        // Score each family for this month
        monthRecord.families[h.label] = {};
        for (const family of families) {
          const flaggedRets = familyReturns[family];
          const score = scoreSignal(flaggedRets, baselineMean);
          monthRecord.families[h.label][family] = score;

          // Accumulate flagged returns
          const key = `${family}_${h.label}`;
          const flagAccum = accumulatedFlagged.get(key)!;
          for (const ret of flaggedRets) {
            flagAccum.push(ret);
          }
        }
      }

      monthlyResults.push(monthRecord);
    } catch (e) {
      console.error(`Error processing asOf ${asOf}:`, e);
    }
  }

  const summaryRows: AggregateSummaryRow[] = [];
  for (const family of families) {
    for (const h of horizons) {
      const key = `${family}_${h.label}`;
      const flaggedRets = accumulatedFlagged.get(key)!;
      const baselineRets = accumulatedBaseline.get(h.label)!;

      const baselineMean = mean(baselineRets);
      const score = scoreSignal(flaggedRets, baselineMean);

      summaryRows.push({
        family,
        horizon: h.label,
        n: score.n,
        flaggedMeanPct: score.flaggedMean,
        baselineMeanPct: score.baselineMean,
        excessPct: score.excess,
        hitRate: score.hitRate,
      });
    }
  }

  const timestampStr = getTimestampStr();
  const report = {
    timestamp: timestampStr,
    startISO,
    endISO,
    horizons,
    summary: summaryRows,
    runs: monthlyResults,
  };

  mkdirSync("data/backtests", { recursive: true });
  const outPath = join("data/backtests", `backtest-${timestampStr}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  // Format the output table
  let tableStr = "\nDeterministic Signal Backtest Run Results:\n";
  tableStr += "=".repeat(85) + "\n";
  tableStr += `${"Family".padEnd(15)} | ${"Horizon".padEnd(8)} | ${"N".padStart(6)} | ${"Flagged Mean %".padStart(15)} | ${"Baseline Mean %".padStart(16)} | ${"Excess %".padStart(10)} | ${"Hit Rate".padStart(8)}\n`;
  tableStr += "-".repeat(85) + "\n";

  for (const r of summaryRows) {
    const fStr = r.family.padEnd(15);
    const hStr = r.horizon.padEnd(8);
    const nStr = String(r.n).padStart(6);
    const fMean = r.flaggedMeanPct.toFixed(2) + "%";
    const bMean = r.baselineMeanPct.toFixed(2) + "%";
    const excess = (r.excessPct >= 0 ? "+" : "") + r.excessPct.toFixed(2) + "%";
    const hit = (r.hitRate * 100).toFixed(1) + "%";

    tableStr += `${fStr} | ${hStr} | ${nStr} | ${fMean.padStart(14)} | ${bMean.padStart(15)} | ${excess.padStart(9)} | ${hit.padStart(7)}\n`;
  }
  tableStr += "=".repeat(85) + "\n";
  tableStr += `Results written to: ${outPath}\n`;

  return tableStr;
}
