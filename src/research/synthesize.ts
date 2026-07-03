// Deterministic digest synthesis. Stored facts → ranked insights, EACH carrying
// an `evidence` provenance string. The LLM never invents here; it only narrates
// this output later. Generalized to full market: breadth, GICS pulse, AI-lens
// pulse, tripwires (live + persisted RuleEvents), sector-vs-hyperscaler divergence,
// credit (HYG/IEF financing proxy), near-term catalysts, and data-health. Hard
// per-family caps keep the digest readable at 500+ tickers.

export type Severity = "info" | "warn" | "critical";

export type Insight = {
  family:
    | "breadth"
    | "movers"
    | "gics_pulse"
    | "ai_pulse"
    | "tripwire"
    | "divergence"
    | "credit"
    | "catalysts"
    | "data_health";
  severity: Severity;
  text: string;
  evidence: string; // provenance — never empty
  sectorCode?: string;
  symbol?: string;
};

export type SynthInput = {
  asOf: string; // YYYY-MM-DD
  breadth?: { pctAbove50dma: number; advancers: number; decliners: number };
  movers?: { symbol: string; retPct: number }[];
  gicsPulse?: { sectorCode: string; retPct: number }[];
  aiPulse?: { sectorCode: string; retPct: number }[];
  tripwires?: { id: string; severity: Severity; message: string; evidence: string }[];
  /** Persisted RuleEvents (from src/db/queries.recentRuleEvents) — feed the tripwire family. */
  ruleEvents?: { ruleId: string; severity: Severity; message: string; firedAt: string }[];
  divergences?: { sectorCode: string; sectorRetPct: number; hyperscalerRetPct: number }[];
  /** HYG/IEF ratio change (%) over ~30d — financing-stress proxy (see credit_proxy tripwire). */
  credit?: { ratioChangePct: number; lookbackDays?: number; sectorCode?: string };
  /** Dated catalysts; only those inside the next-7-day window from asOf are surfaced. */
  catalysts?: { d: string; kind: string; symbol?: string; sectorCode?: string; title: string }[];
  /** Data-quality signals: stale prices, failed overnight jobs, suspect despiked ticks. */
  dataHealth?: {
    ageDays?: number | null;
    stalePriceCount?: number;
    failedJobRuns?: string[];
    suspectTicks?: string[];
  };
};

export type Digest = {
  asOf: string;
  headline: string;
  insights: Insight[];
  counts: Record<string, number>;
};

export type SynthCaps = { perFamily?: number; total?: number };

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

// Named thresholds (greppable, tunable in one place). Credit/catalyst semantics
// follow the donor's deterministic synthesis + the credit_proxy tripwire.
const T = {
  creditStress: -5, // HYG/IEF 30d ≤ this → financing-stress warn (matches credit_proxy rule)
  creditSevere: -10, // ≤ this → escalate to critical
  catalystWindowDays: 7, // dated catalysts within this many days of asOf → surfaced
  staleDays: 3, // price age > this → data-health warn
};

/** Add whole days to a YYYY-MM-DD string; lexicographic compare stays valid. */
function addDaysStr(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function synthesize(input: SynthInput, caps: SynthCaps = {}): Digest {
  const perFamily = caps.perFamily ?? 3;
  const total = caps.total ?? 20;
  const raw: Insight[] = [];

  // ── Breadth ──────────────────────────────────────────────
  if (input.breadth) {
    const { pctAbove50dma, advancers, decliners } = input.breadth;
    const sev: Severity = pctAbove50dma < 30 || pctAbove50dma > 70 ? "warn" : "info";
    raw.push({
      family: "breadth",
      severity: sev,
      text: `Market breadth: ${pctAbove50dma.toFixed(0)}% of names above their 50-day MA (${advancers} up / ${decliners} down).`,
      evidence: `breadth: pctAbove50dma=${pctAbove50dma.toFixed(1)} from local closes as of ${input.asOf}`,
    });
  }

  // ── Movers (top gainers/losers) ──────────────────────────
  if (input.movers && input.movers.length > 0) {
    const sorted = [...input.movers].sort((a, b) => b.retPct - a.retPct);
    const top = sorted.slice(0, 3);
    const bottom = sorted.slice(-3).reverse();
    for (const m of top) {
      raw.push({
        family: "movers",
        severity: "info",
        text: `${m.symbol} +${m.retPct.toFixed(1)}%`,
        evidence: `movers: ${m.symbol} retPct=${m.retPct.toFixed(2)} (top gainer)`,
        symbol: m.symbol,
      });
    }
    for (const m of bottom) {
      if (m.retPct < 0) {
        raw.push({
          family: "movers",
          severity: "info",
          text: `${m.symbol} ${m.retPct.toFixed(1)}%`,
          evidence: `movers: ${m.symbol} retPct=${m.retPct.toFixed(2)} (top decliner)`,
          symbol: m.symbol,
        });
      }
    }
  }

  // ── GICS / AI-lens pulse (extremes) ──────────────────────
  const pulseFamily = (
    rows: { sectorCode: string; retPct: number }[] | undefined,
    family: "gics_pulse" | "ai_pulse",
  ): void => {
    if (!rows || rows.length === 0) return;
    const sorted = [...rows].sort((a, b) => b.retPct - a.retPct);
    const picks = [sorted[0], sorted[sorted.length - 1]];
    for (const p of picks) {
      raw.push({
        family,
        severity: p.retPct <= -5 ? "warn" : "info",
        text: `${p.sectorCode} ${p.retPct >= 0 ? "+" : ""}${p.retPct.toFixed(1)}%`,
        evidence: `${family}: ${p.sectorCode} retPct=${p.retPct.toFixed(2)} as of ${input.asOf}`,
        sectorCode: p.sectorCode,
      });
    }
  };
  pulseFamily(input.gicsPulse, "gics_pulse");
  pulseFamily(input.aiPulse, "ai_pulse");

  // ── Divergence (sector vs hyperscaler capex proxy) ───────
  if (input.divergences) {
    for (const d of input.divergences) {
      const gap = d.sectorRetPct - d.hyperscalerRetPct;
      if (Math.abs(gap) >= 15) {
        raw.push({
          family: "divergence",
          severity: Math.abs(gap) >= 30 ? "critical" : "warn",
          text: `${d.sectorCode} diverging ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}pp vs hyperscalers`,
          evidence: `divergence: ${d.sectorCode} ${d.sectorRetPct.toFixed(1)}% vs hyperscaler ${d.hyperscalerRetPct.toFixed(1)}% = ${gap.toFixed(1)}pp`,
          sectorCode: d.sectorCode,
        });
      }
    }
  }

  // ── Tripwires (pass-through, provenance required) ────────
  if (input.tripwires) {
    for (const t of input.tripwires) {
      raw.push({
        family: "tripwire",
        severity: t.severity,
        text: t.message,
        evidence: t.evidence || `tripwire:${t.id}`,
        symbol: undefined,
      });
    }
  }

  // ── Persisted RuleEvents → tripwire family (provenance = fire date) ──
  if (input.ruleEvents) {
    for (const e of input.ruleEvents) {
      raw.push({
        family: "tripwire",
        severity: e.severity,
        text: e.message,
        evidence: `tripwire ${e.ruleId} fired ${e.firedAt.slice(0, 10)}`,
      });
    }
  }

  // ── Credit proxy (HYG/IEF financing-stress trend) ────────
  if (input.credit) {
    const chg = input.credit.ratioChangePct;
    if (chg <= T.creditStress) {
      const days = input.credit.lookbackDays ?? 30;
      raw.push({
        family: "credit",
        severity: chg <= T.creditSevere ? "critical" : "warn",
        text: `Credit proxy HYG/IEF ${chg.toFixed(1)}% (${days}d) — financing stress for data-center build. Verify ABS spreads at source.`,
        evidence: `credit: HYG/IEF ratio change ${days}d = ${chg.toFixed(2)}%`,
        sectorCode: input.credit.sectorCode,
      });
    }
  }

  // ── Near-term dated catalysts (next-7-day window from asOf) ──
  if (input.catalysts) {
    const horizon = addDaysStr(input.asOf, T.catalystWindowDays);
    for (const c of input.catalysts) {
      if (c.d < input.asOf || c.d > horizon) continue;
      raw.push({
        family: "catalysts",
        severity: "info",
        text: `${c.d} · ${c.kind}${c.symbol ? ` ${c.symbol}` : ""}: ${c.title}`,
        evidence: `catalyst dated ${c.d} (within ${T.catalystWindowDays}d of ${input.asOf})`,
        symbol: c.symbol,
        sectorCode: c.sectorCode,
      });
    }
  }

  // ── Data health (stale prices, failed jobs, suspect despiked ticks) ──
  if (input.dataHealth) {
    const dh = input.dataHealth;
    if (dh.ageDays !== null && dh.ageDays !== undefined && dh.ageDays > T.staleDays) {
      raw.push({
        family: "data_health",
        severity: "warn",
        text: `Price data is ${dh.ageDays} days stale — run the prices job before trusting moves.`,
        evidence: `data_health: latest close ${dh.ageDays}d old as of ${input.asOf}`,
      });
    }
    if (dh.stalePriceCount && dh.stalePriceCount > 0) {
      raw.push({
        family: "data_health",
        severity: "info",
        text: `${dh.stalePriceCount} ticker(s) have stale prices — coverage may be partial.`,
        evidence: `data_health: ${dh.stalePriceCount} symbols with stale closes as of ${input.asOf}`,
      });
    }
    if (dh.suspectTicks && dh.suspectTicks.length > 0) {
      raw.push({
        family: "data_health",
        severity: "warn",
        text: `${dh.suspectTicks.length} ticker(s) show implausible moves — almost certainly splits or bad ticks (despiked), not real. Refetch and verify.`,
        evidence: `data_health: suspect ${dh.suspectTicks.slice(0, 6).join(", ")}`,
      });
    }
    if (dh.failedJobRuns && dh.failedJobRuns.length > 0) {
      raw.push({
        family: "data_health",
        severity: "info",
        text: `${dh.failedJobRuns.length} overnight job issue(s) — coverage may be partial.`,
        evidence: `data_health: ${dh.failedJobRuns.slice(0, 3).join("; ")}`,
      });
    }
  }

  // ── Cap per family (keep highest severity), then total ───
  const byFamily = new Map<string, Insight[]>();
  for (const i of raw) {
    const arr = byFamily.get(i.family) ?? [];
    arr.push(i);
    byFamily.set(i.family, arr);
  }
  let capped: Insight[] = [];
  for (const [, arr] of byFamily) {
    arr.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    capped.push(...arr.slice(0, perFamily));
  }
  // Global ranking: severity first, then keep all criticals even past the cap.
  capped.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const criticals = capped.filter((i) => i.severity === "critical");
  const rest = capped.filter((i) => i.severity !== "critical");
  const insights = [...criticals, ...rest.slice(0, Math.max(0, total - criticals.length))];

  const counts: Record<string, number> = {};
  for (const i of insights) counts[i.severity] = (counts[i.severity] ?? 0) + 1;

  const nCrit = counts.critical ?? 0;
  const headline =
    nCrit > 0
      ? `${nCrit} critical signal${nCrit > 1 ? "s" : ""} — review before deploying capital`
      : insights.length > 0
        ? "Steady tape — no critical signals"
        : "Quiet tape — nothing actionable";

  return { asOf: input.asOf, headline, insights, counts };
}
