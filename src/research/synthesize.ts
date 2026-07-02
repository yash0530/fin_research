// Deterministic digest synthesis. Stored facts → ranked insights, EACH carrying
// an `evidence` provenance string. The LLM never invents here; it only narrates
// this output later. Generalized to full market: breadth, GICS pulse, AI-lens
// pulse, tripwires, and sector-vs-hyperscaler divergence. Hard per-family caps
// keep the digest readable at 500+ tickers.

export type Severity = "info" | "warn" | "critical";

export type Insight = {
  family: "breadth" | "movers" | "gics_pulse" | "ai_pulse" | "tripwire" | "divergence";
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
  divergences?: { sectorCode: string; sectorRetPct: number; hyperscalerRetPct: number }[];
};

export type Digest = {
  asOf: string;
  headline: string;
  insights: Insight[];
  counts: Record<string, number>;
};

export type SynthCaps = { perFamily?: number; total?: number };

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

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
