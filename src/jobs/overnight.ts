// The `overnight` chain — the morning-digest pipeline, run once per market day:
//   prices-heal → stats → news → earnings → rules → digest
// It is a `runChain` (jobs-never-crash: a failed step is recorded and the chain
// continues), and it writes ONE JobRun row per step. The step FUNCTIONS are injected
// (built in scripts/job.ts from the live fetchers), so the order + failure-resilience
// are testable with fakes and no network.
//
// This module also owns two overnight-only step builders:
//   - runPricesHealJob: a light 5-day chart top-up (conc 6 / 300ms) so today's bar
//     lands even if the big prices10y backfill hasn't run.
//   - runDigestJob: assemble a deterministic SynthInput from the DB (rule events,
//     upcoming catalysts, failed-job health) → synthesize() → persist via saveDigest.

import type { SqlDb } from "../db/migrate";
import { runChain, type ChainStep, type ChainSummary } from "./runner";
import { mapPool, type DailyBar } from "../net/yahoo2";
import { marketDate } from "../lib/market-date";
import {
  insertPrices,
  saveDigest,
  recentRuleEvents,
  upcomingCatalysts,
  failedJobRunsSince,
  insertJobRun,
} from "../db/queries";
import { synthesize, type Severity } from "../research/synthesize";
import { buildMarketInputs } from "../research/market-inputs";

const DAY_MS = 86_400_000;

// ── prices-heal ──────────────────────────────────────────────────────────────

export type PricesHealOpts = {
  symbols: string[];
  fetchBars: (symbol: string, period1: Date) => Promise<DailyBar[]>;
  lookbackDays?: number; // default 5
  concurrency?: number; // default 6
  staggerMs?: number; // default 300
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const _sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Top up the last few days of bars for every symbol (conc 6 / 300ms). Never throws. */
export async function runPricesHealJob(db: SqlDb, opts: PricesHealOpts): Promise<string> {
  if (opts.symbols.length === 0) return "no symbols to heal";
  const now = opts.now ? opts.now() : Date.now();
  const period1 = new Date(now - (opts.lookbackDays ?? 5) * DAY_MS);
  const stagger = opts.staggerMs ?? 300;
  const sleep = opts.sleep ?? _sleep;
  let healed = 0;
  let rows = 0;
  let errors = 0;
  await mapPool(opts.symbols, opts.concurrency ?? 6, async (symbol) => {
    try {
      const bars = await opts.fetchBars(symbol, period1);
      if (bars.length) {
        insertPrices(db, bars);
        rows += bars.length;
        healed += 1;
      }
    } catch {
      errors += 1;
    }
    if (stagger > 0) await sleep(stagger);
  });
  return `prices-heal: ${healed}/${opts.symbols.length} symbols, ${rows} bars${errors ? `, ${errors} errors` : ""}`;
}

// ── digest ────────────────────────────────────────────────────────────────────

export type DigestJobOpts = { asOf?: string };

/** Deterministic digest from stored facts → persisted Digest row. */
export async function runDigestJob(db: SqlDb, opts: DigestJobOpts = {}): Promise<string> {
  const asOf = opts.asOf ?? marketDate();
  const ruleEvents = recentRuleEvents(db, { sinceDays: 7 }).map((e) => ({
    ruleId: e.ruleId,
    severity: e.severity as Severity,
    message: e.message,
    firedAt: e.firedAt,
  }));
  // Catalyst window is 14d (donor parity): the 7d window was just short of the Q2
  // earnings cluster, so the whole catalysts family went silent — see market-inputs
  // + synthesize (T.catalystWindowDays). synthesize re-filters to the same horizon.
  const catalysts = upcomingCatalysts(db, asOf, 14);
  const failedJobRuns = failedJobRunsSince(db, 1);
  // Market-derived inputs (breadth/movers/pulses/divergence/credit/data-health).
  const market = buildMarketInputs(db, asOf);
  // Merge failed-job health onto the market-derived data-health (age + stale count).
  const dataHealth = {
    ...(market.dataHealth ?? {}),
    ...(failedJobRuns.length ? { failedJobRuns } : {}),
  };
  const digest = synthesize({
    asOf,
    ...market,
    ...(ruleEvents.length ? { ruleEvents } : {}),
    ...(catalysts.length ? { catalysts } : {}),
    ...(Object.keys(dataHealth).length ? { dataHealth } : {}),
  });
  saveDigest(db, { d: digest.asOf, dataJson: JSON.stringify(digest) });
  return `digest ${digest.asOf}: ${digest.insights.length} insights — "${digest.headline}"`;
}

// ── chain ──────────────────────────────────────────────────────────────────────

export type OvernightDeps = {
  pricesHeal: () => Promise<string>;
  stats: () => Promise<string>;
  news: () => Promise<string>;
  earnings: () => Promise<string>;
  rules: () => Promise<string>;
  digest: () => Promise<string>;
  /** Optional: fill RecCall outcome horizons from local closes (calibration loop). */
  outcomes?: () => Promise<string>;
};

/** The canonical overnight step order (prices-heal → … → digest). */
export function overnightSteps(deps: OvernightDeps): ChainStep[] {
  return [
    { name: "prices-heal", fn: deps.pricesHeal },
    { name: "stats", fn: deps.stats },
    { name: "news", fn: deps.news },
    { name: "earnings", fn: deps.earnings },
    ...(deps.outcomes ? [{ name: "outcomes", fn: deps.outcomes }] : []),
    { name: "rules", fn: deps.rules },
    { name: "digest", fn: deps.digest },
  ];
}

/** Run the overnight chain, recording ONE JobRun row per step. */
export async function runOvernight(db: SqlDb, deps: OvernightDeps): Promise<ChainSummary> {
  return runChain(overnightSteps(deps), (r) => insertJobRun(db, { job: r.job, ok: r.ok, detail: r.detail }));
}
