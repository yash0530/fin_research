// Calibration data layer. Reads RecCall rows from the SQLite DB.
// Server-only; routes using this are force-dynamic + nodejs runtime.
// Returns null/[] gracefully when the DB or table is missing.

export interface RecCallData {
  id: number;
  dossierId: string;
  symbol: string;
  action: string; // BUY | HOLD | TRIM | AVOID
  conviction: string; // HIGH | MEDIUM | LOW
  priceAtCall: number;
  targetLow: number | null;
  targetHigh: number | null;
  stopPrice: number | null;
  judgeSizePct: number;
  governedSizePct: number;
  governorReason: string | null;
  model: string | null;
  thinkingMode: boolean;
  wwcmJson: string | null;
  outcome1mPct: number | null;
  outcome3mPct: number | null;
  outcome6mPct: number | null;
  outcome1yPct: number | null;
  thesisFalsified: boolean | null;
  createdAt: string;
}

export interface TierSummary {
  tier: string; // HIGH | MEDIUM | LOW
  total: number;
  resolved: number;
  favorableRate: number | null;
  capLifted: boolean;
  statusLine: string;
}

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

/**
 * List all RecCalls from the database.
 */
export async function listRecCalls(): Promise<RecCallData[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        'SELECT "id","dossierId","symbol","action","conviction","priceAtCall",' +
          '"targetLow","targetHigh","stopPrice","judgeSizePct","governedSizePct",' +
          '"governorReason","model","thinkingMode","wwcmJson","outcome1mPct",' +
          '"outcome3mPct","outcome6mPct","outcome1yPct","thesisFalsified","createdAt" ' +
          'FROM "RecCall" ORDER BY "createdAt" DESC',
      )
      .all();
    return rows.map((row) => ({
      id: row.id as number,
      dossierId: row.dossierId as string,
      symbol: row.symbol as string,
      action: row.action as string,
      conviction: row.conviction as string,
      priceAtCall: row.priceAtCall as number,
      targetLow: (row.targetLow as number) ?? null,
      targetHigh: (row.targetHigh as number) ?? null,
      stopPrice: (row.stopPrice as number) ?? null,
      judgeSizePct: row.judgeSizePct as number,
      governedSizePct: row.governedSizePct as number,
      governorReason: (row.governorReason as string) ?? null,
      model: (row.model as string) ?? null,
      thinkingMode: Boolean(row.thinkingMode),
      wwcmJson: (row.wwcmJson as string) ?? null,
      outcome1mPct: (row.outcome1mPct as number) ?? null,
      outcome3mPct: (row.outcome3mPct as number) ?? null,
      outcome6mPct: (row.outcome6mPct as number) ?? null,
      outcome1yPct: (row.outcome1yPct as number) ?? null,
      thesisFalsified: row.thesisFalsified !== null ? Boolean(row.thesisFalsified) : null,
      createdAt: row.createdAt as string,
    }));
  } catch {
    return [];
  } finally {
    closeDb(db);
  }
}

/**
 * Favorable-per-action semantics:
 * BUY favorable if outcome > 0; TRIM/AVOID/SELL if < 0; HOLD if |outcome| <= 2.5.
 * Uses 3m outcome, else 1m.
 *
 * NOTE: This is a direct mirror of isFavorable() in src/calibration/governor.ts.
 */
export function isFavorableCall(
  action: string,
  outcome3m: number | null,
  outcome1m: number | null,
): boolean | null {
  const outcome = outcome3m ?? outcome1m;
  if (outcome === null || outcome === undefined) return null;
  const a = (action || "").toUpperCase();
  if (a === "BUY") return outcome > 0;
  if (a === "TRIM" || a === "AVOID" || a === "SELL") return outcome < 0;
  if (a === "HOLD") return Math.abs(outcome) <= 2.5;
  return null;
}

/**
 * Conviction tier summary: favorable rates, cap statuses, and status lines.
 *
 * Thresholds (from src/calibration/governor.ts):
 * - GOVERNOR_MIN_RESOLVED = 5
 * - GOVERNOR_FAVORABLE_THRESHOLD = 0.5 (>=50% favorable)
 * - GOVERNOR_CONSERVATIVE_CAP_PCT = 2.0
 */
export async function tierSummary(): Promise<TierSummary[]> {
  const calls = await listRecCalls();
  const tiers = ["HIGH", "MEDIUM", "LOW"];

  return tiers.map((tier) => {
    const tierCalls = calls.filter(
      (c) => (c.conviction || "").toUpperCase() === tier,
    );
    const resolvedCalls = tierCalls.filter(
      (c) => isFavorableCall(c.action, c.outcome3mPct, c.outcome1mPct) !== null,
    );

    const total = tierCalls.length;
    const resolved = resolvedCalls.length;

    const favorableCount = resolvedCalls.filter(
      (c) => isFavorableCall(c.action, c.outcome3mPct, c.outcome1mPct) === true,
    ).length;

    const favorableRate = resolved > 0 ? favorableCount / resolved : null;

    const minResolved = 5;
    const minFavorableRate = 0.5;
    const capPct = 2.0;

    const capLifted =
      resolved >= minResolved &&
      favorableRate !== null &&
      favorableRate >= minFavorableRate;

    let statusLine = "";
    if (resolved < minResolved) {
      statusLine = `${tier}: ${resolved}/${minResolved} resolved — cap ${capPct.toFixed(0)}%`;
    } else {
      const favPct = Math.round((favorableRate || 0) * 100);
      if (favorableRate !== null && favorableRate < minFavorableRate) {
        statusLine = `${tier}: ${resolved} resolved, ${favPct}% favorable — cap ${capPct.toFixed(0)}%`;
      } else {
        statusLine = `${tier}: ${resolved} resolved, ${favPct}% favorable — cap LIFTED`;
      }
    }

    return {
      tier,
      total,
      resolved,
      favorableRate,
      capLifted,
      statusLine,
    };
  });
}
