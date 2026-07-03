// The monthly buy-list draft job: RecCalls → buildBuyList → persisted draft.
// Candidates are BUY verdicts within the freshness window; sizes are
// min(judge, governed) normalized over the month's capital (all in the pure
// src/buylist/build). Re-running REPLACES the month's draft (items are
// delete+insert in one txn) but never touches a finalized month.

import type { SqlDb } from "../db/migrate";
import { settings } from "../config/settings";
import { buildBuyList, type Candidate } from "../buylist/build";

const DAY_MS = 86_400_000;

export type BuyListJobOpts = {
  month?: string; // YYYY-MM (default: current)
  capitalUsd?: number;
  minLotUsd?: number;
  maxAgeDays?: number;
  now?: () => number;
};

export function candidatesFromRecCalls(db: SqlDb, nowMs: number): Candidate[] {
  const rows = db
    .prepare(
      `SELECT symbol, dossierId, action, conviction, judgeSizePct, governedSizePct,
              governorReason, createdAt
         FROM RecCall ORDER BY id DESC`,
    )
    .all() as {
    symbol: string;
    dossierId: string;
    action: Candidate["action"];
    conviction: Candidate["conviction"];
    judgeSizePct: number;
    governedSizePct: number;
    governorReason: string | null;
    createdAt: string | number;
  }[];
  // newest call per symbol wins
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const r of rows) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    const created = typeof r.createdAt === "number" ? r.createdAt : Date.parse(`${r.createdAt}Z`) || Date.parse(r.createdAt);
    out.push({
      symbol: r.symbol,
      dossierId: r.dossierId,
      action: r.action,
      conviction: r.conviction,
      judgeSizePct: r.judgeSizePct,
      governedSizePct: r.governedSizePct,
      governorReason: r.governorReason ?? "",
      ageDays: Number.isFinite(created) ? Math.floor((nowMs - (created as number)) / DAY_MS) : 9999,
    });
  }
  return out;
}

export function runBuyListJob(db: SqlDb, opts: BuyListJobOpts = {}): string {
  const now = opts.now ?? Date.now;
  const nowMs = now();
  const month = opts.month ?? new Date(nowMs).toISOString().slice(0, 7);
  const capitalUsd = opts.capitalUsd ?? settings.buylist.capitalUsd;
  const minLotUsd = opts.minLotUsd ?? settings.buylist.minLotUsd;
  const maxAgeDays = opts.maxAgeDays ?? settings.buylist.maxCandidateAgeDays;

  const existing = db.prepare(`SELECT status FROM BuyList WHERE month = ?`).get(month) as
    | { status: string }
    | undefined;
  if (existing && existing.status !== "draft") {
    return `buylist ${month}: already ${existing.status} — draft not regenerated`;
  }

  const candidates = candidatesFromRecCalls(db, nowMs);
  const list = buildBuyList(candidates, { capitalUsd, minLotUsd, maxAgeDays });

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO BuyList (month, status, capitalUsd) VALUES (?, 'draft', ?)
       ON CONFLICT(month) DO UPDATE SET capitalUsd = excluded.capitalUsd`,
    ).run(month, capitalUsd);
    db.prepare(`DELETE FROM BuyListItem WHERE buyListMonth = ?`).run(month);
    const ins = db.prepare(
      `INSERT INTO BuyListItem
         (buyListMonth, rank, dossierId, symbol, plannedUsd, governedSizePct, governorReason, skipped)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const it of list.items) {
      ins.run(month, it.rank, it.dossierId, it.symbol, it.plannedUsd, it.effectiveSizePct, it.governorReason, it.skipped ? 1 : 0);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  const bought = list.items.filter((i) => !i.skipped);
  return `buylist ${month}: ${bought.length} position(s), $${Math.round(list.deployedUsd)} planned, $${Math.round(list.cashUsd)} cash (candidates: ${candidates.length})`;
}
