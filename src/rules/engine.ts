// Tripwire evaluation. Faithful port of ResearchEngine/lib/rules/engine.ts, adapted
// to this repo's SqlDb (node:sqlite) instead of Prisma.
//
// Two layers:
//   1. PURE evaluators (`evaluateRule`, `interpolate`, `underCooloff`) over an
//      injectable `RuleContext` — no I/O, unit-tested with fixtures.
//   2. A SqlDb-bound context + `runAllRules` orchestration that reads Price /
//      ManualSeries and records fires as `RuleEvent` rows via src/db/queries.
//
// Tripwires are *signals*, not pages: a fire records a RuleEvent row; the morning
// digest and Signals view read those rows. Nothing is pushed anywhere. Rules are
// config DATA (src/config/tripwires.ts), never hardcoded logic.

import type { SqlDb } from "../db/migrate";
import { despike } from "../lib/metrics";
import { insertRuleEvent, recentRuleEvents } from "../db/queries";
import type { CloseRow, Fired, RuleContext, TripwireRule } from "./types";

const DAY_MS = 86_400_000;

export function interpolate(message: string, value: number | string | null): string {
  return message.replaceAll("{value}", value === null ? "" : String(value));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Today as a YYYY-MM-DD string (UTC). */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add (or subtract) whole days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDaysStr(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`).getTime() + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Drawdown-from-high (%) over the last `lookbackDays` bars. null if too few bars. */
export function drawdownFromCloses(rows: CloseRow[], lookbackDays: number): number | null {
  const window = rows.slice(-lookbackDays);
  if (window.length < 2) return null;
  let peak = -Infinity;
  for (const r of window) if (r.close > peak) peak = r.close;
  if (peak <= 0) return null;
  const last = window[window.length - 1].close;
  return round2(((last - peak) / peak) * 100);
}

export async function evaluateRule(
  rule: TripwireRule,
  ctx: RuleContext,
  firedIds: Set<string>,
): Promise<Fired | null> {
  const fired = (value: number | string | null): Fired => ({
    id: rule.id,
    severity: rule.severity,
    message: interpolate(rule.message, value),
    value,
  });

  switch (rule.type) {
    case "drawdown": {
      const rows = await ctx.getCloses(rule.symbol, rule.lookbackDays);
      const dd = drawdownFromCloses(rows, rule.lookbackDays);
      if (dd === null) return null;
      return dd <= rule.pct ? fired(dd) : null;
    }

    case "consecutive_monthly": {
      const rows = await ctx.getSeriesLast(rule.series, rule.n);
      if (rows.length < rule.n) return null;
      const ok =
        rule.direction === "down"
          ? rows.every((r) => r.value < 0)
          : rows.every((r) => r.value > 0);
      return ok ? fired(rows.map((r) => r.value).join(", ")) : null;
    }

    case "flag_equals": {
      const hit = await ctx.seriesValueWithin(rule.series, rule.value, rule.withinDays);
      return hit ? fired(rule.value) : null;
    }

    case "ratio_change": {
      const [rowsA, rowsB] = await Promise.all([
        ctx.getCloses(rule.a, rule.lookbackDays),
        ctx.getCloses(rule.b, rule.lookbackDays),
      ]);
      const byDateB = new Map(rowsB.map((r) => [r.d, r.close]));
      const ratios: number[] = [];
      for (const r of rowsA) {
        const b = byDateB.get(r.d);
        if (b) ratios.push(r.close / b);
      }
      if (ratios.length < 5) return null; // too few shared dates — skip silently
      const change = round2((ratios[ratios.length - 1] / ratios[0] - 1) * 100);
      return change <= rule.pct ? fired(change) : null;
    }

    case "compound": {
      if (!rule.allOf.every((id) => firedIds.has(id))) return null;
      if (rule.noneOf.some((id) => firedIds.has(id))) return null;
      if (rule.requireNotRecent === "capex_raise") {
        const raised = await ctx.seriesValueWithin("capex_flag", 1, 35);
        if (raised) return null;
      }
      return fired(null);
    }
  }
}

export function underCooloff(lastFiredAt: Date | null, cooloffDays: number, now: Date): boolean {
  if (!lastFiredAt) return false;
  return now.getTime() - lastFiredAt.getTime() < cooloffDays * DAY_MS;
}

// ── SqlDb-bound context + orchestration ──────────────────────────────────────

/** Build a RuleContext from the engine DB (Price + ManualSeries). Never throws. */
export function sqlRuleContext(db: SqlDb, opts: { today?: string } = {}): RuleContext {
  const today = opts.today ?? todayStr();
  return {
    today,
    async getCloses(symbol, lastN) {
      const rows = db
        .prepare('SELECT "d","close" FROM "Price" WHERE "symbol"=? ORDER BY "d" ASC')
        .all(symbol.toUpperCase()) as { d: string; close: number }[];
      const cleaned = despike(rows.map((r) => r.close));
      const merged = rows.map((r, i) => ({ d: r.d, close: cleaned[i] }));
      return merged.slice(-lastN);
    },
    async getSeriesLast(series, n) {
      return db
        .prepare('SELECT "d","value" FROM "ManualSeries" WHERE "series"=? ORDER BY "d" DESC LIMIT ?')
        .all(series, n) as { d: string; value: number }[];
    },
    async seriesValueWithin(series, value, withinDays) {
      const lo = addDaysStr(today, -withinDays);
      const row = db
        .prepare(
          'SELECT 1 FROM "ManualSeries" WHERE "series"=? AND "value"=? AND "d">=? AND "d"<=? LIMIT 1',
        )
        .get(series, value, lo, today) as unknown;
      return row !== undefined && row !== null;
    },
  };
}

export type RulesRunResult = {
  evaluated: number;
  fired: Fired[];
  suppressed: string[];
};

/**
 * Evaluate every rule against the DB-bound context, apply per-rule cooloff (via the
 * last recorded RuleEvent), and persist fresh fires as RuleEvent rows (unless dryRun).
 * Compounds see the fired set from the SAME pass (simple rules run first).
 */
export async function runAllRules(
  db: SqlDb,
  tripwires: TripwireRule[],
  opts: { dryRun?: boolean; today?: string; now?: Date } = {},
): Promise<RulesRunResult> {
  const ctx = sqlRuleContext(db, opts.today ? { today: opts.today } : {});
  const candidates: Fired[] = [];
  const firedIds = new Set<string>();

  for (const phase of ["simple", "compound"] as const) {
    for (const rule of tripwires) {
      const isCompound = rule.type === "compound";
      if ((phase === "compound") !== isCompound) continue;
      const result = await evaluateRule(rule, ctx, firedIds);
      if (result) {
        candidates.push(result);
        firedIds.add(rule.id);
      }
    }
  }

  const now = opts.now ?? new Date();
  const fired: Fired[] = [];
  const suppressed: string[] = [];
  for (const candidate of candidates) {
    const rule = tripwires.find((r) => r.id === candidate.id)!;
    const last = recentRuleEvents(db, { ruleId: candidate.id, limit: 1 })[0];
    const lastAt = last ? new Date(last.firedAt) : null;
    if (underCooloff(lastAt, rule.cooloffDays, now)) {
      suppressed.push(candidate.id);
      continue;
    }
    if (!opts.dryRun) {
      insertRuleEvent(db, {
        ruleId: candidate.id,
        severity: candidate.severity,
        message: candidate.message,
        firedAt: now.toISOString(),
      });
    }
    fired.push(candidate);
  }

  return { evaluated: tripwires.length, fired, suppressed };
}

export async function runRulesJob(
  db: SqlDb,
  tripwires: TripwireRule[],
  opts: { dryRun?: boolean; today?: string; now?: Date } = {},
): Promise<string> {
  const result = await runAllRules(db, tripwires, opts);
  const firedText = result.fired.length
    ? result.fired.map((f) => `${f.severity.toUpperCase()} ${f.id}: ${f.message}`).join(" | ")
    : "no rules fired";
  const suffix = result.suppressed.length ? `; cooloff-suppressed: ${result.suppressed.join(",")}` : "";
  return `evaluated ${result.evaluated}${opts.dryRun ? " (dry-run)" : ""} — ${firedText}${suffix}`;
}
