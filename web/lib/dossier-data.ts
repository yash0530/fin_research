// Reads _dossier_state + RecCall rows from the SQLite DB, following the
// story-data.ts pattern. Server-only; routes using this are force-dynamic +
// nodejs runtime. Returns null/[] gracefully when the DB or table is missing.

import type {
  DossierState,
  DossierListRow,
  HydratedDossier,
  RecCallRow,
} from "./dossier-types";

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

function safeParse<T>(raw: unknown): T | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * List all dossiers as thin rows for the queue table. Newest first.
 */
export async function listDossiers(): Promise<DossierListRow[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        "SELECT id, symbol, status, json FROM _dossier_state ORDER BY updatedAt DESC",
      )
      .all();
    return rows.map((row) => {
      const state = safeParse<DossierState>(row.json);
      return {
        id: row.id as string,
        symbol: (state?.symbol ?? row.symbol) as string,
        status: (state?.status ?? row.status ?? "queued") as DossierListRow["status"],
        action: state?.verdict?.recommendation ?? null,
        conviction: state?.verdict?.conviction ?? null,
        governedSizePct: state?.recCall?.governedSizePct ?? null,
        startedAt: state?.startedAt ?? null,
        updatedAt: state?.updatedAt ?? 0,
        wallClockMs: computeWallClock(state),
      };
    });
  } catch {
    return [];
  } finally {
    closeDb(db);
  }
}

function computeWallClock(state: DossierState | null): number | null {
  if (!state) return null;
  if (state.startedAt && state.updatedAt && state.status === "done") {
    return state.updatedAt - state.startedAt;
  }
  if (state.startedAt && state.status === "running") {
    return Date.now() - state.startedAt;
  }
  return null;
}

/**
 * Load a single dossier by id (parsed state + RecCall from RecCall table).
 */
export async function dossierById(id: string): Promise<HydratedDossier | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const row = db
      .prepare("SELECT json FROM _dossier_state WHERE id = ?")
      .get(id);
    if (!row) return null;

    const state = safeParse<DossierState>(row.json);
    if (!state) return null;

    const recCall = await recCallForDossierSync(db, id);

    return {
      id: state.id,
      symbol: state.symbol,
      status: state.status,
      startedAt: state.startedAt ?? null,
      updatedAt: state.updatedAt,
      stages: state.stages,
      verdict: state.verdict ?? null,
      bull: state.bull ?? null,
      bear: state.bear ?? null,
      rebuttal: state.rebuttal ?? null,
      critique: state.critique ?? null,
      memo: state.memo ?? null,
      toolCalls: state.toolCalls ?? [],
      error: state.error ?? null,
      recCall,
      wallClockMs: computeWallClock(state),
    };
  } catch {
    return null;
  } finally {
    closeDb(db);
  }
}

function recCallForDossierSync(db: SqlDb, dossierId: string): RecCallRow | null {
  try {
    const row = db
      .prepare(
        'SELECT "id","dossierId","symbol","action","conviction","priceAtCall",' +
          '"targetLow","targetHigh","stopPrice","judgeSizePct","governedSizePct",' +
          '"governorReason","createdAt" FROM "RecCall" WHERE "dossierId" = ? LIMIT 1',
      )
      .get(dossierId);
    if (!row) return null;
    return {
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
      createdAt: row.createdAt as string,
    };
  } catch {
    return null;
  }
}

/**
 * Public RecCall lookup (opens its own DB handle).
 */
export async function recCallForDossier(
  dossierId: string,
): Promise<RecCallRow | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return recCallForDossierSync(db, dossierId);
  } catch {
    return null;
  } finally {
    closeDb(db);
  }
}
