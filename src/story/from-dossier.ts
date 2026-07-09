import type { SqlDb } from "../db/migrate";
import type { DossierState } from "../dossier/state";
import type { Verdict } from "../dossier/schemas";
import { classify } from "../dossier/analyzers";
import {
  loadCloses,
  loadFundamentalsQuarters,
  loadTickerRow,
  peerYearChanges,
  type StoryFundamentalsRow,
} from "../db/queries";
import { percentileRank } from "../tools/relative-rank";
import { buildStory, baseUpsidePct, impliedPrice } from "./build";
import type {
  EvidenceChart,
  Scenario,
  ScenarioPreset,
  Stat,
  StoryPageData,
} from "./schema";

// Deterministic composer: turn a COMPLETED dossier (verdict + evidence) plus the
// real DB rows (Price / FundamentalsQuarter / Ticker / sector peers) into a frozen,
// provenance-bearing StoryPageData. No LLM, no network — narration is a separate,
// optional layer (src/story/narrate.ts). Everything is null-safe so a thin DB still
// yields a renderable page; every gap is disclosed in a footnote (data_status).

export type ComposeOpts = { asOf?: string; now?: () => number };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round = (v: number, dp = 0): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

/** Compact money label from a raw USD amount (FundamentalsQuarter fields are
 *  stored in actual dollars, e.g. 39_648_000_000 → "$39.6B"). */
export function money(usd: number): string {
  const a = Math.abs(usd);
  if (a >= 1e9) return `$${round(usd / 1e9, 1)}B`;
  if (a >= 1e6) return `$${round(usd / 1e6, 0)}M`;
  if (a >= 1e3) return `$${round(usd / 1e3, 0)}K`;
  return `$${round(usd, 0)}`;
}

type Targets = { low: number; mid: number; high: number };

/** DCF fair-value range from evidence, when a valuation tool ran. */
function dcfTargets(state: DossierState): Targets | null {
  for (const tc of state.toolCalls) {
    if (tc.error) continue;
    if (!/dcf|valuation/i.test(tc.tool)) continue;
    const range = (tc.data as Record<string, unknown>)["fairValueRange"] as
      | { low?: unknown; mid?: unknown; high?: unknown }
      | undefined;
    if (range && isNum(range.low) && isNum(range.mid) && isNum(range.high)) {
      const vals = [range.low, range.mid, range.high].sort((a, b) => a - b);
      return { low: vals[0], mid: vals[1], high: vals[2] };
    }
  }
  return null;
}

/** Target prices for bear/base/bull: DCF range when present, else judge targets. */
function resolveTargets(state: DossierState, v: Verdict): Targets {
  const dcf = dcfTargets(state);
  if (dcf) return dcf;
  const low = v.target_price_range.low;
  const high = v.target_price_range.high;
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return { low: lo, mid: (lo + hi) / 2, high: hi };
}

/** Trailing annual revenue: sum of the last 4 quarters, else latest × 4. */
function annualRevenue(quarters: StoryFundamentalsRow[]): number | null {
  const withRev = quarters.filter((q) => isNum(q.revenue));
  if (withRev.length === 0) return null;
  const last4 = withRev.slice(-4);
  if (last4.length === 4) return last4.reduce((s, q) => s + (q.revenue as number), 0);
  return (withRev[withRev.length - 1].revenue as number) * 4;
}

/** Build the three scenarios by holding revenue/margin/shares and pricing the P/E
 *  to each target (impliedPrice = revenue×margin×pe/shares ⇒ pe = target×shares/(rev×margin)). */
function buildScenarios(
  targets: Targets,
  base: { revenue: number; margin: number; shares: number },
): { bear: Scenario; base: Scenario; bull: Scenario } {
  const denom = base.revenue * base.margin;
  const usable = denom > 0 && base.shares > 0;
  // Synthetic base so the estimator math stays valid (impliedPrice == target) even
  // with no fundamentals: revenue 100, margin 1, shares 100 ⇒ impliedPrice == pe.
  const rev = usable ? base.revenue : 100;
  const mgn = usable ? base.margin : 1;
  const shr = usable ? base.shares : 100;
  const d = rev * mgn;
  const peFor = (target: number): number => (d > 0 ? round((target * shr) / d, 2) : 0);
  const mk = (target: number): Scenario => ({ revenue: rev, margin: mgn, pe: peFor(target), sharesOut: shr });
  return { bear: mk(targets.low), base: mk(targets.mid), bull: mk(targets.high) };
}

function cycleStage(label: string, position: number): string {
  const phase =
    position < 0.25 ? "trough" : position < 0.5 ? "early-cycle" : position < 0.75 ? "mid-cycle" : "late-cycle";
  return `${label} · ${phase}`;
}

const CYCLE_BANDS = [
  { label: "trough", widthPct: 25, color: "var(--b1)" },
  { label: "early", widthPct: 25, color: "var(--b2)" },
  { label: "mid", widthPct: 25, color: "var(--b3)" },
  { label: "late/peak", widthPct: 25, color: "var(--b4)" },
];

/**
 * Compose (and validate/freeze) the story page for a completed dossier. Throws if
 * the dossier has no verdict (nothing to narrate) or the payload is malformed.
 */
export function composeStoryPageData(db: SqlDb, state: DossierState, opts: ComposeOpts = {}): StoryPageData {
  const now = opts.now ?? Date.now;
  const symbol = state.symbol.toUpperCase();
  const verdict = state.verdict;
  if (!verdict) throw new Error(`dossier ${state.id} (${symbol}) has no verdict — cannot build a story page`);

  const analyzer = classify(symbol, state.sectorCode);
  const asOf = opts.asOf ?? new Date(now()).toISOString().slice(0, 10);

  const closes = loadCloses(db, symbol); // despiked by default
  const priceAtBuild = closes.length > 0 ? round(closes[closes.length - 1], 2) : 0;
  const quarters = loadFundamentalsQuarters(db, symbol);
  const ticker = loadTickerRow(db, symbol);

  // Citable tools that actually produced evidence (drives statTape evidenceRefs).
  const citable = new Set(state.toolCalls.filter((t) => !t.error).map((t) => t.tool));
  const ref = (tool: string): { evidenceRef?: string } => (citable.has(tool) ? { evidenceRef: tool } : {});

  // ── Scenarios (judge/DCF targets → priced P/E) ──────────────────────────────
  const latest = quarters[quarters.length - 1];
  const annualRev = annualRevenue(quarters);
  const margin = latest && isNum(latest.netIncome) && isNum(latest.revenue) && (latest.revenue as number) > 0
    ? (latest.netIncome as number) / (latest.revenue as number)
    : 0;
  const shares = latest && isNum(latest.sharesOut) ? (latest.sharesOut as number) : 0;
  const targets = resolveTargets(state, verdict);
  const scenarios = buildScenarios(targets, { revenue: annualRev ?? 0, margin, shares });
  const presets: ScenarioPreset[] = [
    { label: "Bear case", scenario: scenarios.bear },
    { label: "Base case", scenario: scenarios.base },
    { label: "Bull case", scenario: scenarios.bull },
  ];

  // ── Stat tape ───────────────────────────────────────────────────────────────
  const statTape: Stat[] = [];
  if (priceAtBuild > 0) statTape.push({ label: "Price (build)", value: `$${round(priceAtBuild, 2).toLocaleString()}`, ...ref("price_history") });
  if (ticker && isNum(ticker.forwardPE)) statTape.push({ label: "Forward P/E", value: `${round(ticker.forwardPE, 1)}x`, ...ref("fundamentals") });
  if (latest && isNum(latest.revenue)) statTape.push({ label: "Revenue (latest Q)", value: money(latest.revenue as number), ...ref("fundamentals") });
  if (latest && isNum(latest.grossProfit) && isNum(latest.revenue) && (latest.revenue as number) > 0)
    statTape.push({ label: "Gross margin", value: `${round(((latest.grossProfit as number) / (latest.revenue as number)) * 100, 1)}%`, ...ref("fundamentals") });
  if (margin > 0) statTape.push({ label: "Net margin", value: `${round(margin * 100, 1)}%`, ...ref("fundamentals") });
  if (ticker && isNum(ticker.fiftyTwoWeekLow) && isNum(ticker.fiftyTwoWeekHigh))
    statTape.push({ label: "52-week range", value: `$${round(ticker.fiftyTwoWeekLow, 2)} → $${round(ticker.fiftyTwoWeekHigh, 2)}`, ...ref("price_history") });

  // ── Cycle strip (analyzer + relative-rank percentile) ───────────────────────
  const peers = peerYearChanges(db, symbol);
  const subjMetric = ticker && isNum(ticker.yearChange) ? ticker.yearChange : null;
  const position =
    subjMetric !== null && peers.length > 0
      ? round(percentileRank(peers.map((p) => p.metric), subjMetric) / 100, 3)
      : 0.5;

  // ── Charts: revenue bars + 1y despiked price line ───────────────────────────
  const charts: EvidenceChart[] = [];
  const revQuarters = quarters.filter((q) => isNum(q.revenue));
  if (revQuarters.length >= 2) {
    charts.push({
      title: "Revenue",
      subtitle: "quarterly, $M (local fundamentals)",
      labels: revQuarters.map((q) => q.periodEnd),
      series: [{ label: "Revenue", data: revQuarters.map((q) => round(q.revenue as number, 0)), type: "bar" }],
      showValueLabels: true,
    });
  }
  if (closes.length >= 2) {
    // Downsample to ≤26 points so the frozen line stays light.
    const oneYear = closes.slice(-252);
    const step = Math.max(1, Math.ceil(oneYear.length / 26));
    const sampled = oneYear.filter((_, i) => i % step === 0);
    charts.push({
      title: "Price — 1Y",
      subtitle: "despiked daily close, $ (local Price table)",
      labels: sampled.map(() => ""),
      series: [{ label: "Close", data: sampled.map((c) => round(c, 2)), type: "line", color: "var(--accent)" }],
      fullWidth: true,
    });
  }

  // ── Footnotes (honest, incl. data_status) ───────────────────────────────────
  const footnotes: string[] = [
    `Data frozen at build (${asOf}); the live quote is shown separately and is never merged into the build price.`,
  ];
  if (closes.length === 0) footnotes.push("No local price history — the build price is 0 and the price chart is omitted.");
  else if (closes.length < 200) footnotes.push(`Price history is thin (${closes.length} sessions < 200) — technical framing is provisional.`);
  if (quarters.length === 0) footnotes.push("No local quarterly fundamentals — scenario revenue/margin are neutral placeholders and the P/E is priced straight to the target range.");
  else if (revQuarters.length < 4) footnotes.push(`Only ${revQuarters.length} quarter(s) of revenue on file — the annualized figure extrapolates the latest quarter.`);
  for (const tc of state.toolCalls) {
    const ds = (tc.data as Record<string, unknown>)["data_status"];
    if (ds === "partial" || ds === "missing") {
      const note = (tc.data as Record<string, unknown>)["note"];
      footnotes.push(`Evidence "${tc.tool}": ${ds}${typeof note === "string" ? ` — ${note}` : ""}.`);
    }
  }
  footnotes.push("Research, not advice.");

  // ── Callouts ────────────────────────────────────────────────────────────────
  const callouts: string[] = [];
  const draft: StoryPageData = {
    symbol,
    title: `${symbol}: ${analyzer.label} — ${verdict.recommendation}/${verdict.conviction}`,
    asOf,
    priceAtBuild,
    hero: {
      kicker: ticker?.name ?? symbol,
      eyebrow: analyzer.label,
      thesis: verdict.summary,
      verdict: verdict.recommendation,
      conviction: verdict.conviction,
    },
    statTape,
    cycleStrip: { stage: cycleStage(analyzer.label, position), position, bands: CYCLE_BANDS },
    scenarios,
    presets,
    ...(charts.length > 0 ? { charts } : {}),
    callouts,
    footnotes,
  };

  const baseImplied = impliedPrice(scenarios.base);
  const up = baseUpsidePct(draft);
  if (priceAtBuild > 0 && up !== null) {
    callouts.push(
      `Base-case implied $${round(baseImplied, 0).toLocaleString()} — ${up >= 0 ? "+" : ""}${round(up, 1)}% vs the $${round(priceAtBuild, 0).toLocaleString()} build price.`,
    );
  }
  const wwcm = verdict.what_would_change_mind[0];
  if (wwcm) callouts.push(`Thesis at risk if: ${wwcm}`);

  // Validate + freeze (throws on a malformed shape).
  return buildStory(draft);
}
