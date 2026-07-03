// Calibration campaign seeder. Keeps the dossier queue stocked so the daemon's
// idle-drain steadily grows the RecCall ledger toward statistical significance,
// without ever letting the backlog run away (the daemon does ~1-3 dossiers/day on
// local-Qwen time). Priority order: watchlist → AI-infra lens → GICS sector
// leaders (by market cap). Dedupe (14d) + never-re-dive-a-recent-verdict are the
// queue's job; this only decides WHAT to add and HOW MANY.

import type { SqlDb } from "../db/migrate";
import { enqueueDossier, type EnqueueResult } from "./queue";
import type { DossierStore } from "./state";
import { AI_INFRA_SYMBOLS } from "../config/sectors";
import { watchlistSymbols } from "../db/queries";

export type CampaignOpts = {
  /** Max dossiers left queued+running at once (don't outrun the daemon). */
  targetBacklog?: number;
  /** How many to add in one seeding pass. */
  addPerRun?: number;
  now?: number;
};

/** Priority-ordered candidate universe: watchlist, then AI lens, then GICS leaders. */
export function campaignCandidates(db: SqlDb): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (syms: string[]): void => {
    for (const s of syms) {
      const u = s.toUpperCase();
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  };
  push(watchlistSymbols(db));
  push(AI_INFRA_SYMBOLS);
  // GICS sector leaders by market cap (2 per sector) — breadth beyond the AI lens.
  try {
    const rows = db
      .prepare(
        `SELECT symbol FROM (
           SELECT t.symbol, ts.sectorCode,
                  ROW_NUMBER() OVER (PARTITION BY ts.sectorCode ORDER BY t.marketCap DESC) AS rk
             FROM Ticker t
             JOIN TickerSector ts ON ts.symbol = t.symbol
             JOIN Sector s ON s.code = ts.sectorCode AND s.taxonomy = 'gics'
            WHERE t.active = 1 AND t.marketCap IS NOT NULL
         ) WHERE rk <= 2`,
      )
      .all() as { symbol: string }[];
    push(rows.map((r) => r.symbol));
  } catch {
    // marketCap/columns may be absent in a bare DB — the lens alone still seeds.
  }
  return out;
}

export function seedCampaign(db: SqlDb, store: DossierStore, opts: CampaignOpts = {}): string {
  const targetBacklog = opts.targetBacklog ?? 6;
  const addPerRun = opts.addPerRun ?? 3;
  const now = opts.now ?? Date.now();

  const active = store.all().filter((d) => d.status === "queued" || d.status === "running");
  const room = Math.max(0, targetBacklog - active.length);
  if (room === 0) return `campaign: backlog full (${active.length}/${targetBacklog}) — nothing added`;

  const candidates = campaignCandidates(db);
  const results: EnqueueResult[] = [];
  let added = 0;
  for (const symbol of candidates) {
    if (added >= Math.min(room, addPerRun)) break;
    const r = enqueueDossier(store, symbol, { requestedBy: "campaign", now });
    if (r.enqueued) {
      results.push(r);
      added++;
    }
  }
  const names = results.map((r) => r.id.split("_")[1]).join(", ");
  return added > 0
    ? `campaign: queued ${added} (${names}); backlog now ${active.length + added}/${targetBacklog}`
    : `campaign: no eligible candidates (all recently dived); backlog ${active.length}/${targetBacklog}`;
}
