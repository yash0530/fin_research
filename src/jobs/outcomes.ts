// Fill RecCall outcome horizons (1m/3m/6m/1y) from LOCAL despiked closes — zero
// network. Runs in the overnight chain so the calibration ledger (and therefore
// the sizing governor's earned-trust math) advances automatically as horizons
// come due. Pure math lives in src/calibration/outcomes.

import type { SqlDb } from "../db/migrate";
import { horizonReturns, type Bar } from "../calibration/outcomes";
import { despike } from "../lib/metrics";

export type OutcomesJobOpts = { now?: () => number };

type RecRow = {
  id: number;
  symbol: string;
  priceAtCall: number;
  createdAt: string | number;
  outcome1mPct: number | null;
  outcome3mPct: number | null;
  outcome6mPct: number | null;
  outcome1yPct: number | null;
};

function toIso(createdAt: string | number): string {
  const ms = typeof createdAt === "number" ? createdAt : Date.parse(`${createdAt}Z`) || Date.parse(createdAt);
  return new Date(Number.isFinite(ms) ? ms : 0).toISOString().slice(0, 10);
}

export function runOutcomesJob(db: SqlDb, opts: OutcomesJobOpts = {}): string {
  const asOf = new Date((opts.now ?? Date.now)()).toISOString().slice(0, 10);
  const due = db
    .prepare(
      `SELECT id, symbol, priceAtCall, createdAt, outcome1mPct, outcome3mPct, outcome6mPct, outcome1yPct
         FROM RecCall
        WHERE outcome1mPct IS NULL OR outcome3mPct IS NULL OR outcome6mPct IS NULL OR outcome1yPct IS NULL`,
    )
    .all() as RecRow[];
  if (due.length === 0) return "outcomes: nothing pending";

  const upd = db.prepare(
    `UPDATE RecCall SET outcome1mPct = ?, outcome3mPct = ?, outcome6mPct = ?, outcome1yPct = ? WHERE id = ?`,
  );
  let updated = 0;
  let checked = 0;
  for (const r of due) {
    checked++;
    try {
      const createdIso = toIso(r.createdAt);
      const rows = db
        .prepare(`SELECT d, close FROM Price WHERE symbol = ? AND d >= ? ORDER BY d ASC`)
        .all(r.symbol, createdIso) as { d: string; close: number }[];
      if (rows.length === 0) continue;
      const cleaned = despike(rows.map((x) => x.close));
      const bars: Bar[] = rows.map((x, i) => ({ d: x.d, close: cleaned[i] }));
      const h = horizonReturns(createdIso, r.priceAtCall, bars, asOf);
      const next = {
        m1: h.outcome1mPct ?? r.outcome1mPct,
        m3: h.outcome3mPct ?? r.outcome3mPct,
        m6: h.outcome6mPct ?? r.outcome6mPct,
        y1: h.outcome1yPct ?? r.outcome1yPct,
      };
      const changed =
        next.m1 !== r.outcome1mPct || next.m3 !== r.outcome3mPct || next.m6 !== r.outcome6mPct || next.y1 !== r.outcome1yPct;
      if (changed) {
        upd.run(next.m1, next.m3, next.m6, next.y1, r.id);
        updated++;
      }
    } catch {
      // catch-per-item: one bad row never aborts the sweep
    }
  }
  return `outcomes: ${updated} filled / ${checked} pending checked (asOf ${asOf})`;
}
