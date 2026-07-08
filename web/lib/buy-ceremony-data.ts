// Server-only data + compute helpers for the /portfolio monthly buy-ceremony
// wizard (web/app/portfolio/BuyCeremony.tsx). Step 1 harvests recent BUY-verdict
// RecCalls and cross-references the watchlist buy-band; step 2 recomputes governor
// sizing LIVE against the current track record (src/calibration/governor.ts) and
// allocates the month's capital (src/buylist/build.ts). No broker/order code —
// step 4 renders a plain order sheet for MANUAL entry only.

import { settings } from "@engine/config/settings";
import { governSize, type CalRec } from "@engine/calibration/governor";
import { buildBuyList, type Candidate as BuyListCandidate } from "@engine/buylist/build";
import { getCandidatesPreview, type CandidatePreview } from "./buylist-data";
import { listRecCalls } from "./calibration-data";

interface SqlDb {
  prepare(sql: string): {
    get(...args: unknown[]): Record<string, unknown> | undefined;
    all(...args: unknown[]): Record<string, unknown>[];
  };
  close?: () => void;
}

async function openDb(): Promise<SqlDb | null> {
  try {
    const mod = await import("node:sqlite");
    const file = (
      process.env.DATABASE_URL ?? "file:../data/engine.db"
    ).replace(/^file:/, "");
    const db = new mod.DatabaseSync(file, { readOnly: true });
    return db as unknown as SqlDb;
  } catch {
    return null;
  }
}

function closeDb(db: SqlDb): void {
  if (typeof db.close === "function") db.close();
}

export interface HarvestCandidate extends CandidatePreview {
  close: number | null;
  buyUnder: number | null;
  distancePct: number | null;
  inBand: boolean;
  onWatchlist: boolean;
}

/** Step 1: recent BUY-verdict RecCalls, decorated with watchlist buy-band distance. */
export async function loadHarvestCandidates(): Promise<HarvestCandidate[]> {
  const candidates = await getCandidatesPreview(settings.buylist.maxCandidateAgeDays);
  const db = await openDb();
  if (!db) {
    return candidates.map((c) => ({ ...c, close: null, buyUnder: null, distancePct: null, inBand: false, onWatchlist: false }));
  }
  try {
    return candidates.map((c) => {
      let buyUnder: number | null = null;
      let onWatchlist = false;
      try {
        const w = db.prepare('SELECT "buyUnder" FROM "WatchlistEntry" WHERE "symbol"=?').get(c.symbol) as
          | { buyUnder: number | null }
          | undefined;
        if (w) {
          onWatchlist = true;
          buyUnder = w.buyUnder ?? null;
        }
      } catch {
        /* best-effort */
      }
      let close: number | null = null;
      try {
        const p = db.prepare('SELECT "close" FROM "Price" WHERE "symbol"=? ORDER BY "d" DESC LIMIT 1').get(c.symbol) as
          | { close: number }
          | undefined;
        close = p?.close ?? null;
      } catch {
        /* best-effort */
      }
      const distancePct =
        close !== null && buyUnder !== null && buyUnder > 0
          ? Math.round(((close - buyUnder) / buyUnder) * 1000) / 10
          : null;
      return {
        ...c,
        close,
        buyUnder,
        distancePct,
        inBand: distancePct !== null && distancePct <= 0,
        onWatchlist,
      };
    });
  } finally {
    closeDb(db);
  }
}

export interface SizedItem {
  symbol: string;
  dossierId: string;
  conviction: string;
  judgeSizePct: number;
  governedSizePct: number;
  governorReason: string;
  effectiveSizePct: number;
  plannedUsd: number;
  skipped: boolean;
  rank: number;
  close: number | null;
  shares: number | null;
}

export interface BuyListPreview {
  capitalUsd: number;
  deployedUsd: number;
  cashUsd: number;
  items: SizedItem[];
}

/** Step 2: live governor sizing + capital allocation over the selected symbols. */
export async function previewBuyList(selectedSymbols: string[]): Promise<BuyListPreview> {
  const harvested = await loadHarvestCandidates();
  const selectedSet = new Set(selectedSymbols.map((s) => s.toUpperCase()));
  const selected = harvested.filter((c) => selectedSet.has(c.symbol.toUpperCase()));

  const allCalls = await listRecCalls();
  const calRecs: CalRec[] = allCalls.map((c) => ({
    action: c.action as CalRec["action"],
    conviction: c.conviction as CalRec["conviction"],
    outcome1mPct: c.outcome1mPct,
    outcome3mPct: c.outcome3mPct,
  }));

  const governedBySymbol = new Map<string, { governed: number; reason: string }>();
  const buildCandidates: BuyListCandidate[] = selected.map((c) => {
    const governed = governSize(c.conviction, c.judgeSizePct, calRecs);
    governedBySymbol.set(c.symbol, governed);
    return {
      symbol: c.symbol,
      dossierId: c.dossierId,
      action: "BUY",
      conviction: c.conviction as BuyListCandidate["conviction"],
      judgeSizePct: c.judgeSizePct,
      governedSizePct: governed.governed,
      governorReason: governed.reason,
      ageDays: c.ageDays,
    };
  });

  const result = buildBuyList(buildCandidates, {
    capitalUsd: settings.buylist.capitalUsd,
    minLotUsd: settings.buylist.minLotUsd,
    maxAgeDays: settings.buylist.maxCandidateAgeDays,
  });

  const bySymbol = new Map(selected.map((c) => [c.symbol, c]));
  const items: SizedItem[] = result.items.map((it) => {
    const src = bySymbol.get(it.symbol);
    const governed = governedBySymbol.get(it.symbol);
    return {
      symbol: it.symbol,
      dossierId: it.dossierId,
      conviction: it.conviction,
      judgeSizePct: src?.judgeSizePct ?? 0,
      governedSizePct: governed?.governed ?? 0,
      governorReason: it.governorReason,
      effectiveSizePct: it.effectiveSizePct,
      plannedUsd: it.plannedUsd,
      skipped: it.skipped,
      rank: it.rank,
      close: src?.close ?? null,
      shares: src?.close && src.close > 0 ? Math.floor(it.plannedUsd / src.close) : null,
    };
  });

  return { capitalUsd: result.capitalUsd, deployedUsd: result.deployedUsd, cashUsd: result.cashUsd, items };
}

/** True when no BuyList row exists yet for the given month (YYYY-MM). */
export function ceremonyDue(latestBuyListMonth: string | null, todayIso: string): { due: boolean; dayOfMonth: number } {
  const month = todayIso.slice(0, 7);
  const dayOfMonth = Number(todayIso.slice(8, 10));
  return { due: latestBuyListMonth !== month && dayOfMonth <= 14, dayOfMonth };
}
