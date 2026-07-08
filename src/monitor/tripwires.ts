// Tripwire surfacing — PURE functions that decide which tripwire/rule-engine/
// filing alerts apply to which held+watchlist symbols, so the "/" Action Center
// and the ticker cockpit "WHAT KILLS IT?" quadrant share ONE tested mapping
// instead of ad-hoc reader logic.
//
// Two layers, both pure over injected data (no DB, no clock, no network):
//   - `evaluateTripwiresPure` re-runs the existing rules-engine evaluators over
//     an in-memory RuleContext built from injected closes/series (dry surface —
//     nothing is persisted; the jobs pipeline still owns RuleEvent writes).
//   - `surfaceAlerts` maps already-fired RuleEvent rows + FilingEvent rows onto
//     symbols. An 8-K item 4.02 (non-reliance) ALWAYS surfaces as critical,
//     regardless of tripwire config. Filing-diff events surface by their
//     LLM-assigned severity (thesis-relevant → critical-adjacent warning).

import { evaluateRule } from "../rules/engine";
import type { CloseRow, Fired, RuleContext, RuleSeverity, TripwireRule } from "../rules/types";

export type SectorMembership = { code: string; taxonomy: string };

export type SurfacedAlert = {
  id: string;
  symbol: string | null; // null = macro/theme-wide (shown on every exposed name)
  severity: RuleSeverity;
  message: string;
  source: "rule" | "filing";
  firedAt: string | null;
};

export type RuleEventRow = {
  ruleId: string;
  severity: string;
  message: string;
  firedAt: string;
};

export type FilingEventRow = {
  symbol: string;
  accessionNo: string;
  form: string;
  item: string;
  kind: string;
  headline: string;
  snippet: string;
  severity: string;
  filedAt: string;
};

/**
 * Does a tripwire rule apply to a symbol? Symbol-scoped rules match directly;
 * the memory-cycle series rules apply to ai_memory members; the capex/credit
 * macro proxies apply to anything in the ai_infra taxonomy.
 */
export function ruleAppliesToSymbol(
  rule: TripwireRule,
  symbol: string,
  sectors: SectorMembership[],
): boolean {
  if ("symbol" in rule && rule.symbol) return rule.symbol === symbol;
  if (rule.id === "ddr5_two_down" || rule.id === "memory_exit") {
    return sectors.some((s) => s.code === "ai_memory");
  }
  if (rule.id === "capex_guide_cut" || rule.id === "credit_proxy") {
    return sectors.some((s) => s.taxonomy === "ai_infra");
  }
  return false;
}

function normalizeSeverity(s: string): RuleSeverity {
  return s === "critical" || s === "warn" ? s : "info";
}

/** Severity for a filing event. Item 4.02 is ALWAYS critical — hard rule. */
export function filingEventSeverity(evt: Pick<FilingEventRow, "item" | "kind" | "severity">): RuleSeverity {
  if (evt.item === "4.02") return "critical";
  if (evt.kind === "filing-diff") {
    if (evt.severity === "thesis-relevant") return "critical";
    if (evt.severity === "notable") return "warn";
    return "info";
  }
  return normalizeSeverity(evt.severity);
}

export type SurfaceInput = {
  /** Held + watchlist symbols to surface for. */
  symbols: string[];
  /** Sector memberships per symbol (missing = no sector scoping). */
  sectorsBySymbol: Record<string, SectorMembership[]>;
  /** Unacked RuleEvent rows (already fired by the jobs pipeline). */
  ruleEvents: RuleEventRow[];
  /** Recent FilingEvent rows for the same symbols. */
  filingEvents: FilingEventRow[];
  /** Tripwire config (to resolve rule→symbol scope). */
  rules: TripwireRule[];
};

/**
 * Map fired rule events + filing events onto held/watchlist symbols.
 * Returns one alert per (event, symbol) pair, critical first, deduped.
 */
export function surfaceAlerts(input: SurfaceInput): SurfacedAlert[] {
  const out: SurfacedAlert[] = [];
  const seen = new Set<string>();

  for (const evt of input.ruleEvents) {
    const rule = input.rules.find((r) => r.id === evt.ruleId);
    if (!rule) continue;
    const matched = input.symbols.filter((sym) =>
      ruleAppliesToSymbol(rule, sym, input.sectorsBySymbol[sym] ?? []),
    );
    const targets: (string | null)[] = matched.length > 0 ? matched : [null];
    for (const sym of targets) {
      const key = `rule:${evt.ruleId}:${sym ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: evt.ruleId,
        symbol: sym,
        severity: normalizeSeverity(evt.severity),
        message: evt.message,
        source: "rule",
        firedAt: evt.firedAt,
      });
    }
  }

  const symbolSet = new Set(input.symbols);
  for (const evt of input.filingEvents) {
    if (!symbolSet.has(evt.symbol)) continue;
    const severity = filingEventSeverity(evt);
    // Only alert-worthy filings surface here: 4.02 (always) and non-routine diffs.
    const alertWorthy =
      evt.item === "4.02" || (evt.kind === "filing-diff" && severity !== "info");
    if (!alertWorthy) continue;
    const key = `filing:${evt.accessionNo}:${evt.item}:${evt.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${evt.form}-${evt.item}`,
      symbol: evt.symbol,
      severity,
      message: `${evt.headline} (filed ${evt.filedAt})`,
      source: "filing",
      firedAt: evt.filedAt,
    });
  }

  const rank: Record<RuleSeverity, number> = { critical: 0, warn: 1, info: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return out;
}

/** Alerts scoped to ONE symbol (the cockpit "WHAT KILLS IT?" quadrant). */
export function alertsForSymbol(
  symbol: string,
  sectors: SectorMembership[],
  ruleEvents: RuleEventRow[],
  filingEvents: FilingEventRow[],
  rules: TripwireRule[],
): SurfacedAlert[] {
  return surfaceAlerts({
    symbols: [symbol],
    sectorsBySymbol: { [symbol]: sectors },
    ruleEvents,
    filingEvents,
    rules,
  }).filter((a) => a.symbol === symbol);
}

// ── Pure re-evaluation (dry — never persists) ────────────────────────────────

export type PureRuleData = {
  today: string; // YYYY-MM-DD
  closesBySymbol: Record<string, CloseRow[]>;
  /** Manual series rows, newest first per series. */
  seriesByName: Record<string, { d: string; value: number }[]>;
};

/** Build an in-memory RuleContext from injected data (no DB). */
export function pureRuleContext(data: PureRuleData): RuleContext {
  return {
    today: data.today,
    async getCloses(symbol, lastN) {
      return (data.closesBySymbol[symbol] ?? []).slice(-lastN);
    },
    async getSeriesLast(series, n) {
      return (data.seriesByName[series] ?? []).slice(0, n);
    },
    async seriesValueWithin(series, value, withinDays) {
      const rows = data.seriesByName[series] ?? [];
      const loMs = new Date(`${data.today}T00:00:00Z`).getTime() - withinDays * 86_400_000;
      return rows.some((r) => r.value === value && new Date(`${r.d}T00:00:00Z`).getTime() >= loMs);
    },
  };
}

/**
 * Evaluate every tripwire against injected metrics/prices (simple rules first so
 * compounds see the same-pass fired set). Pure and side-effect free — a dry
 * surface for UIs; RuleEvent persistence stays in the jobs pipeline.
 */
export async function evaluateTripwiresPure(
  rules: TripwireRule[],
  data: PureRuleData,
): Promise<Fired[]> {
  const ctx = pureRuleContext(data);
  const fired: Fired[] = [];
  const firedIds = new Set<string>();
  for (const phase of ["simple", "compound"] as const) {
    for (const rule of rules) {
      if ((phase === "compound") !== (rule.type === "compound")) continue;
      try {
        const result = await evaluateRule(rule, ctx, firedIds);
        if (result) {
          fired.push(result);
          firedIds.add(rule.id);
        }
      } catch {
        // never-crash: a bad rule/series is skipped, not fatal
      }
    }
  }
  return fired;
}
