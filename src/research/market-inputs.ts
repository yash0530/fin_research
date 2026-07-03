// Market-derived digest inputs. `buildMarketInputs(db, asOf)` turns the stored price
// book (Price / Sector / TickerSector) into the market-computed half of a `SynthInput`
// — breadth, movers, gics/ai pulses, ai_*-vs-hyperscaler divergences, the HYG/IEF
// credit proxy, and data-health (age + stale count). The overnight digest already
// derives ruleEvents / catalysts / failedJobRuns; this fills the rest so the digest
// is no longer starved down to a single tripwire.
//
// Discipline (ported from ResearchEngine/lib/analyst/snapshot.ts +
// lib/research/synthesize.ts, both read-only donors):
//   - Closes are ALWAYS despiked via ../lib/metrics before any metric — a split
//     artifact or fat-fingered tick can never become a "mover" or a pulse.
//   - Move metrics (1-day, 30-day, 50-dma, advancers/decliners) only count symbols
//     that actually traded on the newest date (`isFresh`), so delisted stragglers
//     never distort the tape — they surface exclusively in `dataHealth.stalePriceCount`.
//   - Every derivation degrades to omission/null on missing data and NEVER throws.

import type { SqlDb } from "../db/migrate";
import { despike, median, pctChange } from "../lib/metrics";
import {
  activeSectorMemberships,
  activeSymbols,
  closesSince,
  latestBarDates,
  maxPriceDate,
  recentTradingDates,
} from "../db/queries";
import { CREDIT_BENCHMARKS } from "../config/sectors";
import type { SynthInput } from "./synthesize";

/** The market-computed slice of a SynthInput. `asOf`, tripwires/ruleEvents and
 *  catalysts are owned by the digest job; this owns everything price-derived. */
export type MarketInputs = Pick<
  SynthInput,
  "breadth" | "movers" | "gicsPulse" | "aiPulse" | "divergences" | "credit" | "dataHealth"
>;

// ── Tunables (greppable, donor-aligned) ─────────────────────────────────────
const LOOKBACK_CAL_DAYS = 120; // covers a 50-trading-day MA (~72 cal days) with slack
const MA_WINDOW = 50; // breadth: % above the 50-day moving average
const RET_30D = 30; // trading-day lookback for 30d returns + credit ratio
const CREDIT_LOOKBACK = 30; // HYG/IEF ratio change window (trading days)
const MIN_RATIOS = 5; // credit needs ≥5 date-aligned ratios or it's null (donor)
const MOVER_MIN_PRICE = 2; // skip sub-$2 junk from the movers list
const MOVER_TOP = 8; // top movers by |1-day %|
const STALE_TRADING_DAYS = 3; // a last bar lagging the book by > this many sessions is stale

// Hyperscaler capex basket (donor: BENCHMARKS minus the HYG/IEF credit pair). Their
// 30d mean is the yardstick each ai_* sector's 30d move is measured against.
const HYPERSCALER_BASKET = ["MSFT", "GOOGL", "AMZN", "META"];
const BENCHMARK_SYMBOLS = new Set(CREDIT_BENCHMARKS.map((b) => b.symbol.toUpperCase()));

type Dated = { d: string; close: number };

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Add whole days to a YYYY-MM-DD string (UTC), returning YYYY-MM-DD. */
function addDaysStr(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Whole days between two YYYY-MM-DD dates (to − from). */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Percent change over `days` sessions using the last (days+1) closes, or null. */
function pctOverDays(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  return pctChange(closes[closes.length - 1 - days], closes[closes.length - 1]);
}

/** HYG/IEF ratio change (%) over ~`lookback` date-aligned sessions — the credit_proxy
 *  math (donor). Needs ≥5 shared dates or returns null. */
function creditRatioChange(a: Dated[], b: Dated[], lookback: number): number | null {
  const byB = new Map(b.map((r) => [r.d, r.close]));
  const ratios: number[] = [];
  for (const r of a.slice(-lookback)) {
    const bv = byB.get(r.d);
    if (bv && bv !== 0) ratios.push(r.close / bv);
  }
  if (ratios.length < MIN_RATIOS || ratios[0] === 0) return null;
  return (ratios[ratios.length - 1] / ratios[0] - 1) * 100;
}

/**
 * Derive the market-computed digest inputs from the DB. Pure over the injected
 * `SqlDb`; every field is omitted rather than guessed when the data is missing.
 */
export function buildMarketInputs(db: SqlDb, asOf: string): MarketInputs {
  const out: MarketInputs = {};
  const maxDate = maxPriceDate(db);

  // ── Data health (works even with a sparse book) ───────────────────────────
  const dataHealth: NonNullable<SynthInput["dataHealth"]> = {};
  if (maxDate) {
    dataHealth.ageDays = daysBetween(maxDate, asOf);
    // stalePriceCount: active symbols whose latest bar lags the book by > N sessions.
    // "No bar at all" counts as stale (an infinite lag) — that's how delisted/acquired
    // stragglers (e.g. ANSS) show up as partial coverage.
    const recent = recentTradingDates(db, STALE_TRADING_DAYS + 1);
    const threshold = recent[recent.length - 1] ?? maxDate; // lag-N date (oldest of the recent N+1)
    const latestBySymbol = new Map(latestBarDates(db).map((r) => [r.symbol, r.d]));
    let stale = 0;
    for (const sym of activeSymbols(db)) {
      const last = latestBySymbol.get(sym);
      if (last === undefined || last < threshold) stale += 1;
    }
    dataHealth.stalePriceCount = stale;
  }
  if (Object.keys(dataHealth).length > 0) out.dataHealth = dataHealth;

  if (!maxDate) return out; // no prices → only (empty) data-health is derivable

  // ── Load + despike the metric window (grouped per symbol, dates kept) ──────
  const rows = closesSince(db, addDaysStr(maxDate, -LOOKBACK_CAL_DAYS));
  const rawBySymbol = new Map<string, Dated[]>();
  for (const r of rows) {
    let arr = rawBySymbol.get(r.symbol);
    if (!arr) rawBySymbol.set(r.symbol, (arr = []));
    arr.push({ d: r.d, close: r.close });
  }
  const bySymbol = new Map<string, Dated[]>();
  for (const [sym, arr] of rawBySymbol) {
    const cleaned = despike(arr.map((x) => x.close));
    bySymbol.set(sym, arr.map((x, i) => ({ d: x.d, close: cleaned[i] })));
  }
  const datedOf = (sym: string): Dated[] => bySymbol.get(sym) ?? [];
  const closesOf = (sym: string): number[] => datedOf(sym).map((x) => x.close);
  /** Traded on the newest session — the gate for every move metric. */
  const isFresh = (sym: string): boolean => {
    const arr = datedOf(sym);
    return arr.length > 0 && arr[arr.length - 1].d === maxDate;
  };

  const nonBenchmarkActive = activeSymbols(db).filter((s) => !BENCHMARK_SYMBOLS.has(s));

  // ── Breadth (% above 50-dma + advancers/decliners on the last session) ─────
  let above = 0;
  let ma50Denom = 0;
  let advancers = 0;
  let decliners = 0;
  for (const sym of nonBenchmarkActive) {
    if (!isFresh(sym)) continue;
    const closes = closesOf(sym);
    if (closes.length >= 2) {
      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      if (last > prev) advancers += 1;
      else if (last < prev) decliners += 1;
    }
    if (closes.length >= MA_WINDOW) {
      const ma = mean(closes.slice(-MA_WINDOW));
      ma50Denom += 1;
      if (closes[closes.length - 1] > ma) above += 1;
    }
  }
  if (ma50Denom > 0) {
    out.breadth = { pctAbove50dma: (above / ma50Denom) * 100, advancers, decliners };
  }

  // ── Movers (top |1-day %|, ≥ $2, benchmarks excluded) ──────────────────────
  const movers: { symbol: string; retPct: number }[] = [];
  for (const sym of nonBenchmarkActive) {
    if (!isFresh(sym)) continue;
    const closes = closesOf(sym);
    if (closes.length < 2 || closes[closes.length - 1] < MOVER_MIN_PRICE) continue;
    const ret = pctOverDays(closes, 1);
    if (ret !== null) movers.push({ symbol: sym, retPct: ret });
  }
  if (movers.length > 0) {
    movers.sort((a, b) => Math.abs(b.retPct) - Math.abs(a.retPct));
    out.movers = movers.slice(0, MOVER_TOP);
  }

  // ── Sector pulses + divergences (grouped by taxonomy) ──────────────────────
  const bySector = new Map<string, { taxonomy: string; symbols: string[] }>();
  for (const m of activeSectorMemberships(db)) {
    let e = bySector.get(m.sectorCode);
    if (!e) bySector.set(m.sectorCode, (e = { taxonomy: m.taxonomy, symbols: [] }));
    e.symbols.push(m.symbol);
  }
  const freshReturns = (symbols: string[], days: number): number[] =>
    symbols
      .filter((s) => isFresh(s))
      .map((s) => pctOverDays(closesOf(s), days))
      .filter((v): v is number => v !== null);

  const gicsPulse: { sectorCode: string; retPct: number }[] = [];
  const aiPulse: { sectorCode: string; retPct: number }[] = [];
  for (const [code, { taxonomy, symbols }] of bySector) {
    const day1 = freshReturns(symbols, 1);
    if (day1.length === 0) continue;
    const entry = { sectorCode: code, retPct: median(day1) };
    if (taxonomy === "gics") gicsPulse.push(entry);
    else if (taxonomy === "ai_infra") aiPulse.push(entry);
  }
  if (gicsPulse.length > 0) out.gicsPulse = gicsPulse;
  if (aiPulse.length > 0) out.aiPulse = aiPulse;

  // Divergence: each ai_* sector's equal-weight 30d move vs the hyperscaler basket.
  const hyperRets = HYPERSCALER_BASKET.filter((s) => isFresh(s))
    .map((s) => pctOverDays(closesOf(s), RET_30D))
    .filter((v): v is number => v !== null);
  if (hyperRets.length > 0) {
    const hyper30 = mean(hyperRets);
    const divergences: { sectorCode: string; sectorRetPct: number; hyperscalerRetPct: number }[] = [];
    for (const [code, { taxonomy, symbols }] of bySector) {
      if (taxonomy !== "ai_infra") continue;
      const rets = freshReturns(symbols, RET_30D);
      if (rets.length === 0) continue;
      divergences.push({ sectorCode: code, sectorRetPct: mean(rets), hyperscalerRetPct: hyper30 });
    }
    if (divergences.length > 0) out.divergences = divergences;
  }

  // ── Credit proxy (HYG/IEF ratio change over ~30 sessions) ──────────────────
  const credit = creditRatioChange(datedOf("HYG"), datedOf("IEF"), CREDIT_LOOKBACK);
  if (credit !== null) out.credit = { ratioChangePct: credit, lookbackDays: RET_30D };

  return out;
}
