// Production tool registry: binds the pure quant tools (dcf, technicals, qoe, …)
// to the REAL engine schema (Price, FundamentalsQuarter, Ticker, TickerSector,
// NewsItem, Catalyst). This is the wiring that lets a live dossier's planner call
// a tool and get computed evidence out of the seeded + backfilled DB — the pure
// math modules stay network-free and golden-tested; this file is the only place
// they touch persistence.
//
// Contract every tool here honours:
//   - returns a ToolResult via the never-throw `execute()` wrapper (callers use it);
//   - carries sources[] (provenance) and an HONEST confidence;
//   - never emits a silent empty: missing/thin inputs surface an explicit
//     `data_status: "ok" | "partial" | "missing"` note.
//
// Local-data tools take NO network. Live tools take injected fetchers and degrade
// to a low-confidence, data_status:"missing" result when offline (never throw the
// dossier off the rails).

import type { SqlDb } from "../db/migrate";
import { ToolRegistry } from "./registry";
import type { Tool, ToolOutput, Source, Confidence } from "./types";
import { loadCloses } from "../db/queries";
import { sma, ema, rsi, macd, maCrossState, fiftyTwoWeek } from "./technicals";
import { financialTrends, type Quarter } from "./financial-trends";
import { dcfThreeScenario, upsidePct } from "./dcf";
import { rankUniverse } from "./relative-rank";
import { sectorHeat, type HeatEntry } from "./sector-heat";
import { peerCompare, type PeerRow } from "./peer-compare";
import { upcomingCatalysts, type CatalystEvent } from "./catalysts";
import { mergeNewsTape, type NewsRow } from "./news-tape";
import { macroContext, type MacroInputs } from "./macro";
import { sentimentScore, type SentimentInputs } from "./sentiment";
import { parseForm4, purchasesFromFilings, clusterBuySignal, type Form4Filing } from "./insider-form4";
import { parseOwnership } from "./institutional";
import { optionsMetrics, type OptionsChain } from "./options-metrics";
import type { QuoteStat } from "../net/yahoo2";
import { qoeReport, type AnnualPeriod } from "./qoe";

export type DataStatus = "ok" | "partial" | "missing";

/**
 * Injected live fetchers. Each returns the raw payload the matching pure parser
 * expects (so the parser stays exercised HERE, network stays in scripts/job.ts).
 * Any fetcher may be omitted → the tool degrades gracefully to low confidence.
 */
export type LiveFetchers = {
  /** yahoo2 quote() → mapped QuoteStat rows (batch). */
  quotes?: (symbols: string[]) => Promise<QuoteStat[]>;
  /** yahoo2 quoteSummary(majorHoldersBreakdown, institutionOwnership) → raw json. */
  ownershipJson?: (symbol: string) => Promise<Record<string, unknown>>;
  /** yahoo2 options() → normalized chain. */
  optionsChain?: (symbol: string) => Promise<OptionsChain>;
  /** EDGAR Form 4 filings for the symbol → raw XML docs. */
  form4Xml?: (symbol: string) => Promise<string[]>;
  /** Free-signal sentiment inputs (reddit/news/rss counts). */
  sentimentInputs?: (symbol: string) => Promise<SentimentInputs>;
};

export type ProductionRegistryOpts = {
  /** The dossier subject; tools default `args.symbol` to this. */
  symbol?: string;
  sectorCode?: string;
  /** As-of date (YYYY-MM-DD) for the catalyst window. Defaults to today. */
  asOf?: string;
  /** Symbol set for the `movers` tool. Defaults to the subject's sector peers. */
  moversUniverse?: string[];
  live?: LiveFetchers;
  now?: () => number;
};

// ── DB read helpers (real schema) ────────────────────────────────────────────

type FundRow = {
  periodEnd: string;
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
  cfo: number | null;
  sga: number | null;
  depreciation: number | null;
  receivables: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  retainedEarnings: number | null;
  ppe: number | null;
};

type TickerRow = {
  symbol: string;
  name: string | null;
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
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function loadTicker(db: SqlDb, symbol: string): TickerRow | undefined {
  return db
    .prepare(
      'SELECT "symbol","name","marketCap","forwardPE","trailingPE","profitMargin","revenueGrowth",' +
        '"fiftyTwoWeekHigh","fiftyTwoWeekLow","beta","eps","yearChange" FROM "Ticker" WHERE "symbol"=?',
    )
    .get(symbol.toUpperCase()) as TickerRow | undefined;
}

/** Quarterly fundamentals, oldest → newest. */
function loadFundamentals(db: SqlDb, symbol: string): FundRow[] {
  return db
    .prepare(
      'SELECT "periodEnd","revenue","grossProfit","operatingIncome","netIncome","fcf","capex",' +
        '"totalAssets","totalDebt","cash","equity","sharesOut","cfo","sga","depreciation",' +
        '"receivables","currentAssets","currentLiabilities","retainedEarnings","ppe" FROM "FundamentalsQuarter" ' +
        'WHERE "symbol"=? ORDER BY "periodEnd" ASC',
    )
    .all(symbol.toUpperCase()) as FundRow[];
}

function sectorsFor(db: SqlDb, symbol: string): string[] {
  const rows = db
    .prepare('SELECT "sectorCode" FROM "TickerSector" WHERE "symbol"=?')
    .all(symbol.toUpperCase()) as { sectorCode: string }[];
  return rows.map((r) => r.sectorCode);
}

/** Distinct symbols sharing any sector with the subject (the subject included). */
function peerSymbols(db: SqlDb, symbol: string): string[] {
  const rows = db
    .prepare(
      'SELECT DISTINCT ts2."symbol" AS symbol FROM "TickerSector" ts1 ' +
        'JOIN "TickerSector" ts2 ON ts1."sectorCode"=ts2."sectorCode" WHERE ts1."symbol"=?',
    )
    .all(symbol.toUpperCase()) as { symbol: string }[];
  return rows.map((r) => r.symbol);
}

/** Latest despiked close for a symbol (used as the current-price proxy). */
export function latestClose(db: SqlDb, symbol: string): number | null {
  const closes = loadCloses(db, symbol);
  return closes.length > 0 ? closes[closes.length - 1] : null;
}

const finiteStats = (db: SqlDb): { symbol: string; yearChange: number | null }[] =>
  db
    .prepare('SELECT "symbol","yearChange" FROM "Ticker" WHERE "yearChange" IS NOT NULL')
    .all() as { symbol: string; yearChange: number }[];

// ── result helpers ───────────────────────────────────────────────────────────

const out = <T extends Record<string, unknown>>(
  data: T,
  sources: Source[],
  confidence: Confidence,
): ToolOutput<T> => ({ data, sources, confidence });

/** A uniform "no usable data" result (still sourced + honest). */
function missing(note: string, sources: Source[]): ToolOutput<Record<string, unknown>> {
  return out({ data_status: "missing" as DataStatus, note }, sources, "low");
}

function areConsecutive(quarters: FundRow[]): boolean {
  for (let i = 1; i < quarters.length; i++) {
    const d1 = new Date(quarters[i - 1].periodEnd).getTime();
    const d2 = new Date(quarters[i].periodEnd).getTime();
    const diffDays = (d2 - d1) / (1000 * 60 * 60 * 24);
    if (diffDays < 60 || diffDays > 120) {
      return false;
    }
  }
  return true;
}

function canBuildCanonical(fourQuarters: FundRow[]): boolean {
  if (fourQuarters.length !== 4) return false;
  for (const q of fourQuarters) {
    if (q.revenue === null || q.revenue === undefined) return false;
    if (q.grossProfit === null || q.grossProfit === undefined) return false;
    if (q.sga === null || q.sga === undefined) return false;
    if (q.depreciation === null || q.depreciation === undefined) return false;
    if (q.operatingIncome === null || q.operatingIncome === undefined) return false;
    if (q.netIncome === null || q.netIncome === undefined) return false;

    const quarterCfo = q.cfo !== null && q.cfo !== undefined ? q.cfo :
                       (q.fcf !== null && q.fcf !== undefined && q.capex !== null && q.capex !== undefined ? q.fcf + q.capex : null);
    if (quarterCfo === null) return false;
  }

  const lastQ = fourQuarters[3];
  if (lastQ.receivables === null || lastQ.receivables === undefined) return false;
  if (lastQ.currentAssets === null || lastQ.currentAssets === undefined) return false;
  if (lastQ.ppe === null || lastQ.ppe === undefined) return false;
  if (lastQ.totalAssets === null || lastQ.totalAssets === undefined) return false;
  if (lastQ.currentLiabilities === null || lastQ.currentLiabilities === undefined) return false;
  if (lastQ.totalDebt === null || lastQ.totalDebt === undefined) return false;
  if (lastQ.equity === null || lastQ.equity === undefined) return false;
  if (lastQ.retainedEarnings === null || lastQ.retainedEarnings === undefined) return false;
  if (lastQ.sharesOut === null || lastQ.sharesOut === undefined) return false;

  return true;
}

function buildAnnualPeriod(fourQuarters: FundRow[]): AnnualPeriod {
  const lastQ = fourQuarters[3];
  let revenue = 0;
  let grossProfit = 0;
  let sga = 0;
  let depreciation = 0;
  let ebit = 0;
  let netIncome = 0;
  let cfo = 0;

  for (const q of fourQuarters) {
    revenue += q.revenue ?? 0;
    grossProfit += q.grossProfit ?? 0;
    sga += q.sga ?? 0;
    depreciation += q.depreciation ?? 0;
    ebit += q.operatingIncome ?? 0;
    netIncome += q.netIncome ?? 0;
    const qCfo = q.cfo !== null && q.cfo !== undefined ? q.cfo :
                 (q.fcf !== null && q.fcf !== undefined && q.capex !== null && q.capex !== undefined ? q.fcf + q.capex : 0);
    cfo += qCfo;
  }

  const totalAssets = lastQ.totalAssets ?? 0;
  const equity = lastQ.equity ?? 0;
  const totalLiabilities = totalAssets - equity;

  return {
    revenue,
    grossProfit,
    sga,
    depreciation,
    ebit,
    netIncome,
    receivables: lastQ.receivables ?? 0,
    currentAssets: lastQ.currentAssets ?? 0,
    ppe: lastQ.ppe ?? 0,
    totalAssets,
    currentLiabilities: lastQ.currentLiabilities ?? 0,
    longTermDebt: lastQ.totalDebt ?? 0,
    totalLiabilities,
    retainedEarnings: lastQ.retainedEarnings ?? 0,
    sharesOut: lastQ.sharesOut ?? 0,
    cfo,
  };
}

function calculateAccrualRatioFromAvailable(quarters: FundRow[]): number | null {
  if (quarters.length === 0) return null;
  const targetQuarters = quarters.slice(-4);
  let totalNetIncome = 0;
  let totalCfo = 0;
  let hasNetIncome = false;
  let hasCfo = false;

  for (const q of targetQuarters) {
    if (q.netIncome !== null && q.netIncome !== undefined) {
      totalNetIncome += q.netIncome;
      hasNetIncome = true;
    }
    const qCfo = q.cfo !== null && q.cfo !== undefined ? q.cfo :
                 (q.fcf !== null && q.fcf !== undefined && q.capex !== null && q.capex !== undefined ? q.fcf + q.capex : null);
    if (qCfo !== null) {
      totalCfo += qCfo;
      hasCfo = true;
    }
  }

  const lastQ = targetQuarters[targetQuarters.length - 1];
  const totalAssets = lastQ.totalAssets;
  if (hasNetIncome && hasCfo && totalAssets !== null && totalAssets !== undefined && totalAssets !== 0) {
    return (totalNetIncome - totalCfo) / totalAssets;
  }
  return null;
}

// ── factory ────────────────────────────────────────────────────────────────

export function buildProductionRegistry(db: SqlDb, opts: ProductionRegistryOpts = {}): ToolRegistry {
  const now = opts.now ?? Date.now;
  const subject = (opts.symbol ?? "").toUpperCase();
  const resolve = (args: Record<string, unknown> | undefined): string =>
    String((args?.["symbol"] as string | undefined) ?? subject ?? "").trim().toUpperCase();
  const live = opts.live ?? {};

  const tools: Tool[] = [];

  // ── LOCAL: price_history ───────────────────────────────────────────────────
  tools.push({
    name: "price_history",
    describe: () => "Despiked daily closes from the local Price table (points, latest, 52w range).",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: `Price (local, despiked) ${sym}` }];
      const closes = loadCloses(db, sym);
      if (closes.length === 0) return missing(`no local price rows for ${sym}`, src);
      const w52 = fiftyTwoWeek(closes);
      const status: DataStatus = closes.length >= 200 ? "ok" : "partial";
      return out(
        {
          symbol: sym,
          points: closes.length,
          latestClose: closes[closes.length - 1],
          fiftyTwoWeekHigh: w52?.high ?? null,
          fiftyTwoWeekLow: w52?.low ?? null,
          pctFromHigh: w52?.pctFromHigh ?? null,
          data_status: status,
          ...(status === "partial" ? { note: `only ${closes.length} closes (<200)` } : {}),
        },
        src,
        closes.length >= 200 ? "high" : "medium",
      );
    },
  });

  // ── LOCAL: technicals ───────────────────────────────────────────────────────
  tools.push({
    name: "technicals",
    describe: () => "SMA/EMA/RSI/MACD, 50/200 golden-cross regime, 52-week breakout over despiked closes.",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: `Price (local, despiked) ${sym}` }];
      const closes = loadCloses(db, sym);
      if (closes.length === 0) return missing(`no local price rows for ${sym}`, src);
      const m = macd(closes);
      const w52 = fiftyTwoWeek(closes);
      const enough = closes.length >= 200;
      return out(
        {
          symbol: sym,
          points: closes.length,
          sma50: sma(closes, 50),
          sma200: sma(closes, 200),
          ema20: ema(closes, 20),
          rsi14: rsi(closes, 14),
          macd: m,
          maCross: maCrossState(closes),
          fiftyTwoWeek: w52,
          data_status: (enough ? "ok" : "partial") as DataStatus,
          ...(enough ? {} : { note: `only ${closes.length} closes — long MAs may be null` }),
        },
        src,
        enough ? "high" : "medium",
      );
    },
  });

  // ── LOCAL: fundamentals ─────────────────────────────────────────────────────
  tools.push({
    name: "fundamentals",
    describe: () => "Latest quarterly fundamentals + Ticker stats + current price (from local tables).",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [
        { label: `FundamentalsQuarter (local) ${sym}` },
        { label: `Ticker stats (local) ${sym}` },
        { label: `Price (local) ${sym}` },
      ];
      const fund = loadFundamentals(db, sym);
      const ticker = loadTicker(db, sym);
      const price = latestClose(db, sym);
      if (fund.length === 0 && !ticker && price === null) {
        return missing(`no fundamentals, stats, or prices for ${sym}`, src);
      }
      const latest = fund[fund.length - 1];
      const haveFund = fund.length > 0;
      const status: DataStatus = haveFund && ticker && price !== null ? "ok" : "partial";
      return out(
        {
          symbol: sym,
          current_price: price,
          latestPeriodEnd: latest?.periodEnd ?? null,
          revenue: latest?.revenue ?? null,
          grossProfit: latest?.grossProfit ?? null,
          operatingIncome: latest?.operatingIncome ?? null,
          netIncome: latest?.netIncome ?? null,
          fcf: latest?.fcf ?? null,
          totalAssets: latest?.totalAssets ?? null,
          totalDebt: latest?.totalDebt ?? null,
          cash: latest?.cash ?? null,
          sharesOut: latest?.sharesOut ?? null,
          marketCap: ticker?.marketCap ?? null,
          forwardPE: ticker?.forwardPE ?? null,
          trailingPE: ticker?.trailingPE ?? null,
          profitMargin: ticker?.profitMargin ?? null,
          revenueGrowth: ticker?.revenueGrowth ?? null,
          quartersAvailable: fund.length,
          data_status: status,
          ...(status === "partial"
            ? { note: `partial inputs (fundamentals=${fund.length}, stats=${ticker ? "y" : "n"}, price=${price !== null ? "y" : "n"})` }
            : {}),
        },
        src,
        status === "ok" ? "high" : "medium",
      );
    },
  });

  // ── LOCAL: financial_trends ─────────────────────────────────────────────────
  tools.push({
    name: "financial_trends",
    describe: () => "Multi-quarter revenue/margin/FCF trajectory from local FundamentalsQuarter.",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: `FundamentalsQuarter (local) ${sym}` }];
      const fund = loadFundamentals(db, sym).filter((r) => r.revenue !== null);
      if (fund.length === 0) return missing(`no fundamentals for ${sym}`, src);
      const quarters: Quarter[] = fund.map((r) => ({
        periodEnd: r.periodEnd,
        revenue: r.revenue ?? 0,
        netIncome: r.netIncome ?? 0,
        grossProfit: r.grossProfit ?? 0,
        fcf: r.fcf ?? 0,
      }));
      const report = financialTrends(quarters);
      const status: DataStatus = quarters.length >= 5 ? "ok" : "partial";
      return out(
        { symbol: sym, ...report, data_status: status, ...(status === "partial" ? { note: `only ${quarters.length} quarters (<5 → no YoY)` } : {}) },
        src,
        status === "ok" ? "high" : "medium",
      );
    },
  });

  // ── LOCAL: qoe ─────────────────────────────────────────────────────────────
  tools.push({
    name: "qoe",
    describe: () => "Quality-of-earnings canonical forensics (Altman Z, Beneish M, Piotroski F, accrual ratio) or FCF-fallback.",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: `FundamentalsQuarter (local) ${sym}` }];
      const fund = loadFundamentals(db, sym);
      if (fund.length === 0) return missing(`no fundamentals for ${sym}`, src);

      if (fund.length >= 8) {
        const last8 = fund.slice(-8);
        if (areConsecutive(last8)) {
          const currentQuarters = last8.slice(-4);
          const priorQuarters = last8.slice(-8, -4);
          if (canBuildCanonical(currentQuarters) && canBuildCanonical(priorQuarters)) {
            const current = buildAnnualPeriod(currentQuarters);
            const prior = buildAnnualPeriod(priorQuarters);
            const report = qoeReport(current, prior);
            return out(
              {
                symbol: sym,
                ...report,
                data_status: "ok" as DataStatus,
              },
              src,
              "high",
            );
          }
        }
      }

      const acc = calculateAccrualRatioFromAvailable(fund);
      return out(
        {
          symbol: sym,
          accrualRatio: acc,
          altmanZ: null,
          altmanZone: null,
          piotroskiF: null,
          beneishM: null,
          beneishFlag: null,
          sbcPctRevenue: null,
          flags: [],
          data_status: "partial" as DataStatus,
          note: "Incomplete annual periods or missing core fields; canonical forensics unavailable.",
        },
        src,
        "low",
      );
    },
  });

  // ── LOCAL: dcf ───────────────────────────────────────────────────────────────
  tools.push({
    name: "dcf",
    describe: () => "3-scenario DCF fair value from local FCF / shares / net debt vs current price.",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: `FundamentalsQuarter (local) ${sym}` }, { label: `Price (local) ${sym}` }];
      const fund = loadFundamentals(db, sym);
      if (fund.length === 0) return missing(`no fundamentals for ${sym}`, src);
      // Trailing FCF: sum last 4 quarters when available, else annualize the latest.
      const fcfs = fund.map((r) => num(r.fcf)).filter((v): v is number => v !== null);
      const shares = num(fund[fund.length - 1].sharesOut);
      const debt = num(fund[fund.length - 1].totalDebt) ?? 0;
      const cash = num(fund[fund.length - 1].cash) ?? 0;
      const price = latestClose(db, sym);
      if (fcfs.length === 0 || shares === null || shares <= 0) {
        return out(
          { symbol: sym, data_status: "missing" as DataStatus, note: "no FCF or shares-outstanding to run a DCF" },
          src,
          "low",
        );
      }
      const trailingFcf =
        fcfs.length >= 4 ? fcfs.slice(-4).reduce((a, b) => a + b, 0) : (fcfs[fcfs.length - 1] ?? 0) * 4;
      const inputs = { baseFcf: trailingFcf, sharesOut: shares, netDebt: debt - cash };
      const result = dcfThreeScenario(inputs, {
        bear: { growthRate: 0.02, years: 5, terminalGrowth: 0.02, discountRate: 0.11 },
        base: { growthRate: 0.08, years: 5, terminalGrowth: 0.025, discountRate: 0.1 },
        bull: { growthRate: 0.15, years: 5, terminalGrowth: 0.03, discountRate: 0.09 },
      });
      const status: DataStatus = trailingFcf > 0 && fcfs.length >= 4 ? "ok" : "partial";
      return out(
        {
          symbol: sym,
          currentPrice: price,
          trailingFcf,
          sharesOut: shares,
          netDebt: debt - cash,
          fairValueRange: result.fairValueRange,
          upsidePctBase: price !== null ? upsidePct(result.fairValueRange.mid, price) : null,
          data_status: status,
          ...(status === "partial"
            ? { note: trailingFcf <= 0 ? "negative trailing FCF — DCF unreliable" : `only ${fcfs.length} FCF quarters (annualized)` }
            : {}),
        },
        src,
        status === "ok" ? "medium" : "low",
      );
    },
  });

  // ── LOCAL: relative_rank ──────────────────────────────────────────────────────
  tools.push({
    name: "relative_rank",
    describe: () => "Percentile rank of the subject's 52-week change across the local universe (+ leader/laggard tag).",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: "Ticker.yearChange (local universe)" }];
      const universe = finiteStats(db)
        .map((r) => ({ symbol: r.symbol.toUpperCase(), metric: r.yearChange as number }))
        .filter((e) => e.metric !== null);
      const ranked = rankUniverse(universe);
      const me = ranked.find((r) => r.symbol === sym);
      if (!me) {
        return out(
          { symbol: sym, universeSize: universe.length, data_status: "missing" as DataStatus, note: `no yearChange stat for ${sym} — run the stats job` },
          src,
          "low",
        );
      }
      return out(
        {
          symbol: sym,
          metric: me.metric,
          percentile: me.percentile,
          tag: me.tag,
          universeSize: universe.length,
          data_status: (universe.length >= 30 ? "ok" : "partial") as DataStatus,
          ...(universe.length < 30 ? { note: `thin universe (${universe.length})` } : {}),
        },
        src,
        universe.length >= 30 ? "high" : "medium",
      );
    },
  });

  // ── LOCAL: sector_heat ────────────────────────────────────────────────────────
  tools.push({
    name: "sector_heat",
    describe: () => "Per-sector return temperature for the subject's sectors (from Ticker.yearChange + TickerSector).",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: "TickerSector + Ticker.yearChange (local)" }];
      const mySectors = sectorsFor(db, sym);
      if (mySectors.length === 0) return missing(`${sym} is linked to no sector`, src);
      const rows = db
        .prepare(
          'SELECT ts."sectorCode" AS sectorCode, t."symbol" AS symbol, t."yearChange" AS yc ' +
            'FROM "TickerSector" ts JOIN "Ticker" t ON t."symbol"=ts."symbol" ' +
            'WHERE ts."sectorCode" IN (' + mySectors.map(() => "?").join(",") + ') AND t."yearChange" IS NOT NULL',
        )
        .all(...mySectors) as { sectorCode: string; symbol: string; yc: number }[];
      const entries: HeatEntry[] = rows.map((r) => ({ symbol: r.symbol, sectorCode: r.sectorCode, retPct: r.yc }));
      if (entries.length === 0) {
        return out(
          { symbol: sym, sectors: mySectors, data_status: "missing" as DataStatus, note: "no member returns available — run the stats job" },
          src,
          "low",
        );
      }
      const heat = sectorHeat(entries).filter((h) => mySectors.includes(h.sectorCode));
      return out(
        { symbol: sym, sectors: mySectors, heat, data_status: "ok" as DataStatus },
        src,
        "medium",
      );
    },
  });

  // ── LOCAL: peer_compare ────────────────────────────────────────────────────────
  tools.push({
    name: "peer_compare",
    describe: () => "Percentile position of the subject within its sector cohort (fwd P/E, revenue growth, margin).",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: "Ticker stats + TickerSector cohort (local)" }];
      const peers = peerSymbols(db, sym);
      if (peers.length === 0) return missing(`${sym} has no sector cohort`, src);
      const cohort: PeerRow[] = peers
        .map((p) => loadTicker(db, p))
        .filter((t): t is TickerRow => !!t)
        .map((t) => ({
          symbol: t.symbol.toUpperCase(),
          forwardPE: t.forwardPE,
          revenueGrowthPct: t.revenueGrowth,
          profitMarginPct: t.profitMargin,
        }));
      const cmp = peerCompare(sym, cohort);
      const status: DataStatus = cohort.length >= 3 ? "ok" : "partial";
      return out(
        { ...cmp, data_status: status, ...(status === "partial" ? { note: `thin cohort (${cohort.length})` } : {}) },
        src,
        cohort.length >= 3 ? "medium" : "low",
      );
    },
  });

  // ── LOCAL: catalysts ──────────────────────────────────────────────────────────
  tools.push({
    name: "catalysts",
    describe: () => "Upcoming dated catalysts for the subject (+ market-wide) within a 45-day window from local Catalyst.",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: "Catalyst (local)" }];
      const asOf = opts.asOf ?? new Date(now()).toISOString().slice(0, 10);
      const rows = db
        .prepare('SELECT "d","kind","symbol","title" FROM "Catalyst" WHERE "d" IS NOT NULL AND ("symbol"=? OR "symbol" IS NULL)')
        .all(sym) as { d: string; kind: string; symbol: string | null; title: string }[];
      const events: CatalystEvent[] = rows.map((r) => ({
        d: r.d,
        kind: r.kind,
        title: r.title,
        ...(r.symbol ? { symbol: r.symbol } : {}),
      }));
      const upcoming = upcomingCatalysts(events, { asOf, withinDays: 45, symbol: sym });
      return out(
        { symbol: sym, asOf, upcoming, count: upcoming.length, data_status: (upcoming.length > 0 ? "ok" : "missing") as DataStatus, ...(upcoming.length === 0 ? { note: "no catalysts in the next 45 days" } : {}) },
        src,
        upcoming.length > 0 ? "medium" : "low",
      );
    },
  });

  // ── LOCAL: news_tape ──────────────────────────────────────────────────────────
  tools.push({
    name: "news_tape",
    describe: () => "Recent local news for the subject (deduped, newest-first, capped) from NewsItem.",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: "NewsItem (local)" }];
      const rows = db
        .prepare(
          'SELECT "urlHash","title","source","publishedAt","symbol","url" FROM "NewsItem" WHERE "symbol"=? ORDER BY "publishedAt" DESC LIMIT 100',
        )
        .all(sym) as { urlHash: string; title: string; source: string | null; publishedAt: string | null; symbol: string | null; url: string }[];
      if (rows.length === 0) return missing(`no local news for ${sym}`, src);
      const tape: NewsRow[] = rows.map((r) => ({
        id: r.urlHash,
        title: r.title,
        source: r.source ?? "unknown",
        publishedAt: r.publishedAt ?? "",
        ...(r.symbol ? { symbol: r.symbol } : {}),
        url: r.url,
      }));
      const merged = mergeNewsTape(tape, { limit: 20 });
      return out({ symbol: sym, items: merged, count: merged.length, data_status: "ok" as DataStatus }, src, "medium");
    },
  });

  // ── LOCAL: macro ───────────────────────────────────────────────────────────────
  tools.push({
    name: "macro",
    describe: () => "Macro regime from latest local benchmark closes (VIX, 10y/3m yields, DXY, HYG/IEF credit proxy).",
    run: async () => {
      const src: Source[] = [{ label: "Price benchmarks (local): ^VIX ^TNX ^IRX DX-Y.NYB HYG IEF" }];
      const vix = latestClose(db, "^VIX");
      const tnx = latestClose(db, "^TNX");
      const irx = latestClose(db, "^IRX");
      const dxy = latestClose(db, "DX-Y.NYB");
      const hyg = latestClose(db, "HYG");
      const ief = latestClose(db, "IEF");
      const inputs: MacroInputs = {};
      if (vix !== null) inputs.vix = vix;
      if (tnx !== null) inputs.tnx = tnx;
      if (irx !== null) inputs.irx = irx;
      if (dxy !== null) inputs.dxy = dxy;
      if (hyg !== null && ief !== null && ief !== 0) inputs.hygIefRatio = hyg / ief;
      const present = Object.keys(inputs).length;
      if (present === 0) return missing("no benchmark closes present — backfill benchmark prices", src);
      const ctx = macroContext(inputs);
      const status: DataStatus = present >= 3 ? "ok" : "partial";
      return out(
        { ...ctx, inputsPresent: Object.keys(inputs), data_status: status, ...(status === "partial" ? { note: "some benchmarks absent" } : {}) },
        src,
        status === "ok" ? "medium" : "low",
      );
    },
  });

  // ── LIVE: quote_snapshot ─────────────────────────────────────────────────────
  tools.push({
    name: "quote_snapshot",
    describe: () => "Live quote snapshot for the subject (price, market cap, P/E, 52w) via injected yahoo2 quote().",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: `yahoo2 quote (live) ${sym}` }];
      if (!live.quotes) return missing(`live quote fetcher not configured (offline) for ${sym}`, src);
      try {
        const rows = await live.quotes([sym]);
        const q = rows.find((r) => r.symbol.toUpperCase() === sym) ?? rows[0];
        if (!q) return missing(`no live quote returned for ${sym}`, src);
        return out(
          {
            symbol: sym,
            price: q.price,
            marketCap: q.marketCap,
            forwardPE: q.forwardPE,
            trailingPE: q.trailingPE,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow,
            yearChange: q.yearChange,
            data_status: (q.price !== null ? "ok" : "partial") as DataStatus,
          },
          src,
          q.price !== null ? "high" : "low",
        );
      } catch (e) {
        return missing(`live quote failed for ${sym}: ${e instanceof Error ? e.message : String(e)}`, src);
      }
    },
  });

  // ── LIVE: movers ─────────────────────────────────────────────────────────────
  tools.push({
    name: "movers",
    describe: () => "Live day movers across the subject's cohort (injected yahoo2 quote() batch → sorted by % change).",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const universe = opts.moversUniverse ?? peerSymbols(db, sym);
      const src: Source[] = [{ label: "yahoo2 quote batch (live)" }];
      if (!live.quotes) return missing("live quote fetcher not configured (offline)", src);
      if (universe.length === 0) return missing(`no cohort universe for ${sym}`, src);
      try {
        const rows = await live.quotes(universe);
        const movers = rows
          .map((r) => ({ symbol: r.symbol.toUpperCase(), yearChange: r.yearChange, price: r.price }))
          .filter((r) => r.yearChange !== null)
          .sort((a, b) => (b.yearChange as number) - (a.yearChange as number));
        if (movers.length === 0) return missing("no comparable quotes returned", src);
        return out(
          { universeSize: universe.length, gainers: movers.slice(0, 5), laggards: movers.slice(-5).reverse(), data_status: "ok" as DataStatus },
          src,
          "medium",
        );
      } catch (e) {
        return missing(`live movers failed: ${e instanceof Error ? e.message : String(e)}`, src);
      }
    },
  });

  // ── LIVE: sentiment ────────────────────────────────────────────────────────────
  tools.push({
    name: "sentiment",
    describe: () => "Composite 0–10 sentiment (reddit/news/rss) via injected free-signal fetcher.",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: `sentiment signals (live) ${sym}` }];
      if (!live.sentimentInputs) return missing(`live sentiment fetcher not configured (offline) for ${sym}`, src);
      try {
        const inputs = await live.sentimentInputs(sym);
        const score = sentimentScore(inputs);
        return out({ symbol: sym, ...score, data_status: "ok" as DataStatus }, src, "medium");
      } catch (e) {
        return missing(`live sentiment failed for ${sym}: ${e instanceof Error ? e.message : String(e)}`, src);
      }
    },
  });

  // ── LIVE: insider_form4 ──────────────────────────────────────────────────────
  tools.push({
    name: "insider_form4",
    describe: () => "Insider open-market cluster-buy signal from injected EDGAR Form 4 filings.",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: `EDGAR Form 4 (live) ${sym}` }];
      if (!live.form4Xml) return missing(`live Form 4 fetcher not configured (offline) for ${sym}`, src);
      try {
        const docs = await live.form4Xml(sym);
        const filings: Form4Filing[] = docs.map((xml) => parseForm4(xml));
        const purchases = purchasesFromFilings(filings);
        const signal = clusterBuySignal(purchases);
        return out(
          { symbol: sym, filings: filings.length, ...signal, data_status: (filings.length > 0 ? "ok" : "missing") as DataStatus, ...(filings.length === 0 ? { note: "no Form 4 filings returned" } : {}) },
          src,
          filings.length > 0 ? "medium" : "low",
        );
      } catch (e) {
        return missing(`live Form 4 failed for ${sym}: ${e instanceof Error ? e.message : String(e)}`, src);
      }
    },
  });

  // ── LIVE: institutional ──────────────────────────────────────────────────────
  tools.push({
    name: "institutional",
    describe: () => "Institutional ownership % + top holders via injected yahoo2 quoteSummary().",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: `yahoo2 ownership (live) ${sym}` }];
      if (!live.ownershipJson) return missing(`live ownership fetcher not configured (offline) for ${sym}`, src);
      try {
        const json = await live.ownershipJson(sym);
        const owned = parseOwnership(json as never);
        return out(
          { symbol: sym, institutionsPct: owned.institutionsPct, topHolders: owned.topHolders.slice(0, 10), data_status: (owned.institutionsPct !== null ? "ok" : "partial") as DataStatus },
          src,
          owned.institutionsPct !== null ? "medium" : "low",
        );
      } catch (e) {
        return missing(`live ownership failed for ${sym}: ${e instanceof Error ? e.message : String(e)}`, src);
      }
    },
  });

  // ── LIVE: options_metrics ────────────────────────────────────────────────────
  tools.push({
    name: "options_metrics",
    describe: () => "Put/call ratio, ATM IV, unusual-volume count from an injected yahoo2 options chain.",
    run: async (args) => {
      const sym = resolve(args as Record<string, unknown>);
      const src: Source[] = [{ label: `yahoo2 options (live) ${sym}` }];
      if (!live.optionsChain) return missing(`live options fetcher not configured (offline) for ${sym}`, src);
      try {
        const chain = await live.optionsChain(sym);
        const m = optionsMetrics(chain);
        return out({ symbol: sym, ...m, underlying: chain.underlying, data_status: "ok" as DataStatus }, src, "medium");
      } catch (e) {
        return missing(`live options failed for ${sym}: ${e instanceof Error ? e.message : String(e)}`, src);
      }
    },
  });

  return new ToolRegistry().registerAll(tools);
}
