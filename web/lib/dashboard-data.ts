// Server-only data loader for the "/" Action Center dashboard. Assembles the daily
// column (tripwire + decay alerts, watchlist buy-band proximity, 7d catalysts), the
// weekly column (Sourcing Inbox from Candidate userState=INBOX + a collapsed
// "killed by quality" log), and the welcome-back staleness check. Follows the
// ticker-data.ts / themes-data.ts openDb (node:sqlite, read-only) pattern —
// never throws; missing tables/DB degrade to empty results.

import { despike } from "@engine/lib/metrics";
import { TRIPWIRES } from "@engine/config/tripwires";
import {
  surfaceAlerts,
  type FilingEventRow,
  type RuleEventRow,
  type SectorMembership,
} from "@engine/monitor/tripwires";
import { loadPortfolio } from "./portfolio-data";
import { loadCapexScorecard, type CapexScorecard } from "./themes-data";
import { tierSummary, type TierSummary } from "./calibration-data";
import { getLatestBuyList } from "./buylist-data";
import { latestDigest } from "./digest-data";
import type { DigestRow } from "./digest-types";

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

export interface AlertRow {
  symbol: string | null;
  kind: string;
  severity: "info" | "warn" | "critical";
  message: string;
  source: "decay" | "rule" | "filing";
}

export interface WatchlistBandRow {
  symbol: string;
  name: string | null;
  close: number | null;
  buyUnder: number | null;
  distancePct: number | null; // negative = already inside the buy band
  inBand: boolean;
}

export interface CatalystRow {
  d: string | null;
  kind: string;
  symbol: string | null;
  title: string;
}

export interface InboxCandidateRow {
  symbol: string;
  name: string | null;
  tier: number;
  triggerTags: string[];
  qualification: string;
  computedAt: string;
  close: number | null;
}

export interface GovernorStrip {
  portfolioMarketValue: number;
  portfolioCostBasis: number;
  positionsCount: number;
  monthCapitalUsd: number | null;
  monthDeployedUsd: number | null;
  monthCashUsd: number | null;
  monthStatus: "draft" | "final" | "none";
  tiers: TierSummary[];
}

export interface PortfolioSnapshotRow {
  symbol: string;
  marketValue: number | null;
  pnlPct: number | null;
  alertCount: number;
}

export interface DashboardData {
  governor: GovernorStrip;
  alerts: AlertRow[];
  watchlistBand: WatchlistBandRow[];
  catalysts: CatalystRow[];
  inbox: InboxCandidateRow[];
  killedByQuality: InboxCandidateRow[];
  digest: DigestRow | null;
  positions: PortfolioSnapshotRow[];
  staleDays: number | null; // days since the latest JobRun/Digest; null if never run
  /** Hyperscaler capex compact — non-null only when an AI-subtheme name is held/watchlisted. */
  capex: CapexScorecard | null;
}

const EMPTY: DashboardData = {
  governor: {
    portfolioMarketValue: 0,
    portfolioCostBasis: 0,
    positionsCount: 0,
    monthCapitalUsd: null,
    monthDeployedUsd: null,
    monthCashUsd: null,
    monthStatus: "none",
    tiers: [],
  },
  alerts: [],
  watchlistBand: [],
  catalysts: [],
  positions: [],
  inbox: [],
  killedByQuality: [],
  digest: null,
  staleDays: null,
  capex: null,
};

/** Held + watchlist symbols with their sector memberships. Never throws. */
function monitorScope(db: SqlDb): { symbols: string[]; sectorsBySymbol: Record<string, SectorMembership[]> } {
  const symbols = new Set<string>();
  try {
    for (const r of db.prepare('SELECT "symbol" FROM "Ticker" WHERE "watchlisted"=1').all()) {
      symbols.add(r.symbol as string);
    }
  } catch {
    /* Ticker table missing */
  }
  try {
    for (const r of db.prepare('SELECT "symbol" FROM "Position"').all()) {
      symbols.add(r.symbol as string);
    }
  } catch {
    /* Position table missing */
  }
  const sectorsBySymbol: Record<string, SectorMembership[]> = {};
  for (const sym of symbols) {
    try {
      sectorsBySymbol[sym] = db
        .prepare(
          'SELECT ts."sectorCode" AS code, s."taxonomy" AS taxonomy FROM "TickerSector" ts ' +
            'JOIN "Sector" s ON s."code"=ts."sectorCode" WHERE ts."symbol"=?',
        )
        .all(sym) as unknown as SectorMembership[];
    } catch {
      sectorsBySymbol[sym] = [];
    }
  }
  return { symbols: Array.from(symbols), sectorsBySymbol };
}

/**
 * Tripwire/rule + filing alerts for held+watchlist names via the tested
 * @engine/monitor/tripwires surfacing (8-K item 4.02 always critical; non-routine
 * filing-diff events included). Never throws.
 */
async function monitorAlerts(
  db: SqlDb,
  scope: { symbols: string[]; sectorsBySymbol: Record<string, SectorMembership[]> },
): Promise<AlertRow[]> {
  try {
    const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const ruleEvents = db
      .prepare(
        'SELECT "ruleId","severity","message","firedAt" FROM "RuleEvent" WHERE "firedAt">=? AND "acked"=0 ORDER BY "firedAt" DESC LIMIT 20',
      )
      .all(cutoff) as unknown as RuleEventRow[];
    let filingEvents: FilingEventRow[] = [];
    try {
      const filingCutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
      filingEvents = db
        .prepare(
          'SELECT "symbol","accessionNo","form","item","kind","headline","snippet","severity","filedAt" ' +
            'FROM "FilingEvent" WHERE "filedAt">=? AND ("item"=\'4.02\' OR "kind"=\'filing-diff\') ' +
            'ORDER BY "filedAt" DESC LIMIT 50',
        )
        .all(filingCutoff) as unknown as FilingEventRow[];
    } catch {
      /* FilingEvent table missing */
    }
    return surfaceAlerts({
      symbols: scope.symbols,
      sectorsBySymbol: scope.sectorsBySymbol,
      ruleEvents,
      filingEvents,
      rules: TRIPWIRES,
    }).map((a) => ({
      symbol: a.symbol,
      kind: a.id,
      severity: a.severity,
      message: a.message,
      source: a.source === "filing" ? ("filing" as const) : ("rule" as const),
    }));
  } catch {
    return [];
  }
}

/** Compact capex scorecard — only when an AI-subtheme name is held/watchlisted. */
async function capexIfAiExposed(scope: {
  sectorsBySymbol: Record<string, SectorMembership[]>;
}): Promise<CapexScorecard | null> {
  const exposed = Object.values(scope.sectorsBySymbol).some((sectors) =>
    sectors.some((s) => s.code.startsWith("ai_")),
  );
  if (!exposed) return null;
  return loadCapexScorecard();
}

/** Watchlist proximity-to-buy-under grid, closest first. */
async function watchlistBand(db: SqlDb): Promise<WatchlistBandRow[]> {
  try {
    const rows = db
      .prepare(
        'SELECT w."symbol" AS symbol, w."buyUnder" AS buyUnder, t."name" AS name ' +
          'FROM "WatchlistEntry" w LEFT JOIN "Ticker" t ON t."symbol"=w."symbol"',
      )
      .all() as { symbol: string; buyUnder: number | null; name: string | null }[];

    const out: WatchlistBandRow[] = [];
    for (const r of rows) {
      const priceRows = db
        .prepare('SELECT "close" FROM "Price" WHERE "symbol"=? ORDER BY "d" DESC LIMIT 30')
        .all(r.symbol) as { close: number }[];
      const closes = despike(priceRows.map((p) => p.close).reverse());
      const close = closes.length > 0 ? closes[closes.length - 1] : null;
      const distancePct =
        close !== null && r.buyUnder !== null && r.buyUnder > 0
          ? Math.round(((close - r.buyUnder) / r.buyUnder) * 1000) / 10
          : null;
      out.push({
        symbol: r.symbol,
        name: r.name,
        close,
        buyUnder: r.buyUnder,
        distancePct,
        inBand: distancePct !== null && distancePct <= 0,
      });
    }
    out.sort((a, b) => {
      if (a.distancePct === null) return 1;
      if (b.distancePct === null) return -1;
      return a.distancePct - b.distancePct;
    });
    return out;
  } catch {
    return [];
  }
}

/** Catalysts dated within the next `days` days. */
async function upcomingCatalysts(db: SqlDb, days = 7): Promise<CatalystRow[]> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const hi = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const rows = db
      .prepare(
        'SELECT "d","kind","symbol","title" FROM "Catalyst" WHERE "d" IS NOT NULL AND "d">=? AND "d"<=? ORDER BY "d" ASC LIMIT 20',
      )
      .all(today, hi) as unknown as CatalystRow[];
    return rows;
  } catch {
    return [];
  }
}

function parseCandidateRow(r: Record<string, unknown>): InboxCandidateRow {
  let triggerTags: string[] = [];
  try {
    const parsed = JSON.parse((r.triggerTags as string) ?? "[]");
    if (Array.isArray(parsed)) triggerTags = parsed.map(String);
  } catch {
    triggerTags = [];
  }
  return {
    symbol: r.symbol as string,
    name: (r.name as string) ?? null,
    tier: r.tier as number,
    triggerTags,
    qualification: (r.qualification as string) ?? "",
    computedAt: (r.computedAt as string) ?? "",
    close: (r.close as number) ?? null,
  };
}

/** Sourcing Inbox: userState=INBOX Candidate rows, split tier 1-2 (actionable) vs tier 3 (killed by quality). */
async function sourcingInbox(db: SqlDb): Promise<{ inbox: InboxCandidateRow[]; killedByQuality: InboxCandidateRow[] }> {
  try {
    const rows = db
      .prepare(
        'SELECT c."symbol" AS symbol, c."tier" AS tier, c."triggerTags" AS triggerTags, ' +
          'c."qualification" AS qualification, c."computedAt" AS computedAt, t."name" AS name, ' +
          '(SELECT "close" FROM "Price" p WHERE p."symbol"=c."symbol" ORDER BY p."d" DESC LIMIT 1) AS close ' +
          'FROM "Candidate" c LEFT JOIN "Ticker" t ON t."symbol"=c."symbol" ' +
          'WHERE c."userState"=\'INBOX\' ORDER BY c."tier" ASC, c."computedAt" DESC',
      )
      .all() as Record<string, unknown>[];
    const decorated = rows.map(parseCandidateRow);
    return {
      inbox: decorated.filter((c) => c.tier === 1 || c.tier === 2),
      killedByQuality: decorated.filter((c) => c.tier === 3),
    };
  } catch {
    return { inbox: [], killedByQuality: [] };
  }
}

/** Days since the latest JobRun or Digest row; null if nothing has ever run. */
async function staleDays(db: SqlDb): Promise<number | null> {
  try {
    let latest: number | null = null;
    try {
      const j = db.prepare('SELECT "startedAt" FROM "JobRun" ORDER BY "startedAt" DESC LIMIT 1').get() as
        | { startedAt: string }
        | undefined;
      if (j?.startedAt) latest = new Date(j.startedAt).getTime();
    } catch {
      /* JobRun table missing */
    }
    try {
      const d = db.prepare('SELECT "createdAt" FROM "Digest" ORDER BY "createdAt" DESC LIMIT 1').get() as
        | { createdAt: string }
        | undefined;
      if (d?.createdAt) {
        const t = new Date(d.createdAt).getTime();
        latest = latest === null ? t : Math.max(latest, t);
      }
    } catch {
      /* Digest table missing */
    }
    if (latest === null) return null;
    return Math.floor((Date.now() - latest) / 86_400_000);
  } catch {
    return null;
  }
}

export async function loadDashboard(): Promise<DashboardData> {
  const db = await openDb();
  if (!db) return EMPTY;

  try {
    const scope = monitorScope(db);
    const [positions, tiers, buyList, digest, alertsFromRules, band, catalysts, inbox, stale, capex] =
      await Promise.all([
        loadPortfolio(),
        tierSummary(),
        getLatestBuyList(),
        latestDigest(),
        monitorAlerts(db, scope),
        watchlistBand(db),
        upcomingCatalysts(db, 7),
        sourcingInbox(db),
        staleDays(db),
        capexIfAiExposed(scope),
      ]);

    let portfolioMarketValue = 0;
    let portfolioCostBasis = 0;
    const decayAlerts: AlertRow[] = [];
    for (const p of positions) {
      portfolioCostBasis += p.costBasis;
      if (p.marketValue !== null) portfolioMarketValue += p.marketValue;
      for (const f of p.findings) {
        decayAlerts.push({
          symbol: p.symbol,
          kind: f.kind,
          severity: f.severity,
          message: f.message,
          source: "decay",
        });
      }
    }

    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthList = buyList?.month === thisMonth ? buyList : null;
    const monthDeployedUsd = monthList
      ? monthList.items.filter((i) => !i.skipped).reduce((s, i) => s + i.plannedUsd, 0)
      : null;

    const snapshotRows: PortfolioSnapshotRow[] = positions.map((p) => ({
      symbol: p.symbol,
      marketValue: p.marketValue,
      pnlPct: p.pnlPct,
      alertCount: p.findings.length,
    }));

    return {
      governor: {
        portfolioMarketValue,
        portfolioCostBasis,
        positionsCount: positions.length,
        monthCapitalUsd: monthList?.capitalUsd ?? null,
        monthDeployedUsd,
        monthCashUsd: monthList && monthDeployedUsd !== null ? monthList.capitalUsd - monthDeployedUsd : null,
        monthStatus: monthList ? (monthList.status as "draft" | "final") : "none",
        tiers,
      },
      alerts: [...decayAlerts, ...alertsFromRules],
      watchlistBand: band,
      catalysts,
      inbox: inbox.inbox,
      killedByQuality: inbox.killedByQuality,
      digest,
      positions: snapshotRows,
      staleDays: stale,
      capex,
    };
  } catch (err) {
    console.error("Error loading dashboard:", err);
    return EMPTY;
  } finally {
    closeDb(db);
  }
}
