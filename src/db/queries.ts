import type { SqlDb } from "./migrate";
import { despike } from "../lib/metrics";
import type { RecCall } from "../dossier/state";
import type { CalRec } from "../calibration/governor";

// Data-access layer: read/write the engine tables via the injectable SqlDb (same
// interface the migration runner + SqliteDossierStore use). Tested against a real
// node:sqlite DB seeded from 0001_init.sql. This is the bridge from the pure
// engine to persistence; the Next.js pages and jobs call these.

export type PriceRow = { symbol: string; d: string; close: number; volume?: number | null };

/** Chunked INSERT OR IGNORE (SQLite has no createMany skipDuplicates). Returns attempted count. */
export function insertPrices(db: SqlDb, rows: PriceRow[]): number {
  const stmt = db.prepare('INSERT OR IGNORE INTO "Price" ("symbol","d","close","volume") VALUES (?,?,?,?)');
  db.exec("BEGIN");
  try {
    for (const r of rows) stmt.run(r.symbol.toUpperCase(), r.d, r.close, r.volume ?? null);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return rows.length;
}

/** Closes for a symbol, oldest→newest. Despiked by default (bad ticks never become signal). */
export function loadCloses(db: SqlDb, symbol: string, opts: { despiked?: boolean } = {}): number[] {
  const rows = db
    .prepare('SELECT "close" FROM "Price" WHERE "symbol"=? ORDER BY "d" ASC')
    .all(symbol.toUpperCase()) as { close: number }[];
  const closes = rows.map((r) => r.close);
  return opts.despiked === false ? closes : despike(closes);
}

export type DigestRow = { d: string; dataJson: string; llmMd?: string | null; llmProvider?: string | null; llmModel?: string | null };

export function saveDigest(db: SqlDb, digest: DigestRow): number {
  const info = db
    .prepare('INSERT INTO "Digest" ("d","dataJson","llmMd","llmProvider","llmModel") VALUES (?,?,?,?,?)')
    .run(digest.d, digest.dataJson, digest.llmMd ?? null, digest.llmProvider ?? null, digest.llmModel ?? null) as {
    lastInsertRowid: number | bigint;
  };
  return Number(info.lastInsertRowid);
}

export function loadLatestDigest(db: SqlDb): { id: number; d: string; dataJson: string; llmMd: string | null } | null {
  const row = db
    .prepare('SELECT "id","d","dataJson","llmMd" FROM "Digest" ORDER BY "createdAt" DESC, "id" DESC LIMIT 1')
    .get() as { id: number; d: string; dataJson: string; llmMd: string | null } | undefined;
  return row ?? null;
}

export function saveRecCall(db: SqlDb, r: RecCall): void {
  db.prepare(
    'INSERT INTO "RecCall" ("dossierId","symbol","action","conviction","priceAtCall","targetLow","targetHigh","stopPrice","judgeSizePct","governedSizePct","governorReason","model","thinkingMode","outcome1mPct","outcome3mPct","outcome6mPct","outcome1yPct","createdAt") ' +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    r.dossierId,
    r.symbol,
    r.action,
    r.conviction,
    r.priceAtCall,
    r.targetLow,
    r.targetHigh,
    r.stopPrice,
    r.judgeSizePct,
    r.governedSizePct,
    r.governorReason ?? null,
    r.model ?? null,
    r.thinkingMode ? 1 : 0,
    r.outcome1mPct,
    r.outcome3mPct,
    r.outcome6mPct,
    r.outcome1yPct,
    new Date(r.createdAt).toISOString(),
  );
}

/** RecCalls shaped for the calibration governor. */
export function loadRecCallsForGovernor(db: SqlDb, opts: { symbol?: string } = {}): CalRec[] {
  const where = opts.symbol ? ' WHERE "symbol"=?' : "";
  const params = opts.symbol ? [opts.symbol.toUpperCase()] : [];
  const rows = db
    .prepare(`SELECT "action","conviction","outcome1mPct","outcome3mPct" FROM "RecCall"${where}`)
    .all(...params) as CalRec[];
  return rows;
}

export function updateRecCallOutcome(
  db: SqlDb,
  dossierId: string,
  o: { outcome1mPct?: number | null; outcome3mPct?: number | null; outcome6mPct?: number | null; outcome1yPct?: number | null; thesisFalsified?: boolean | null },
): void {
  db.prepare(
    'UPDATE "RecCall" SET "outcome1mPct"=?, "outcome3mPct"=?, "outcome6mPct"=?, "outcome1yPct"=?, "thesisFalsified"=? WHERE "dossierId"=?',
  ).run(
    o.outcome1mPct ?? null,
    o.outcome3mPct ?? null,
    o.outcome6mPct ?? null,
    o.outcome1yPct ?? null,
    o.thesisFalsified === null || o.thesisFalsified === undefined ? null : o.thesisFalsified ? 1 : 0,
    dossierId,
  );
}


// ── Seed helpers (universe) ──────────────────────────────────────────────

export type SectorSeedRow = { code: string; name: string; taxonomy: string; driver: number };

export function insertSectors(db: SqlDb, seeds: SectorSeedRow[]): number {
  const stmt = db.prepare('INSERT OR IGNORE INTO "Sector" ("code","name","taxonomy","driver","stage") VALUES (?,?,?,?,?)');
  db.exec("BEGIN");
  try {
    for (const s of seeds) stmt.run(s.code, s.name, s.taxonomy, s.driver, "early");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return seeds.length;
}

export type TickerSeed = {
  symbol: string;
  name?: string;
  source?: string;
  watchlisted?: boolean;
  cik?: string;
  marketCap?: number | null;
  forwardPE?: number | null;
};

export function upsertTicker(db: SqlDb, t: TickerSeed): void {
  db.prepare(
    'INSERT INTO "Ticker" ("symbol","name","source","watchlisted","cik","marketCap","forwardPE") VALUES (?,?,?,?,?,?,?) ' +
      "ON CONFLICT(\"symbol\") DO UPDATE SET name=excluded.name, watchlisted=excluded.watchlisted, marketCap=excluded.marketCap, forwardPE=excluded.forwardPE",
  ).run(
    t.symbol.toUpperCase(),
    t.name ?? null,
    t.source ?? "seed",
    t.watchlisted ? 1 : 0,
    t.cik ?? null,
    t.marketCap ?? null,
    t.forwardPE ?? null,
  );
}

export function linkTickerSector(db: SqlDb, symbol: string, sectorCode: string): void {
  db.prepare('INSERT OR IGNORE INTO "TickerSector" ("symbol","sectorCode") VALUES (?,?)').run(symbol.toUpperCase(), sectorCode);
}

/** Count rows in a table (table name is a trusted literal, never user input). */
export function countRows(db: SqlDb, table: string): number {
  const row = db.prepare(`SELECT count(*) AS c FROM "${table}"`).get() as { c: number };
  return row.c;
}

// ── RuleEvent (tripwire fires) ───────────────────────────────────────────────
//
// NOTE: the fixed prisma schema (prisma/** is frozen for this batch) does not yet
// carry a RuleEvent table, so the helpers below ensure it idempotently at runtime
// — same column shape as the donor's Prisma model (id, ruleId, firedAt, severity,
// message, acked). When a RuleEvent migration lands, this guard becomes a no-op.

const ruleEventTableEnsured = new WeakSet<object>();

function ensureRuleEventTable(db: SqlDb): void {
  if (ruleEventTableEnsured.has(db as unknown as object)) return;
  db.exec(
    'CREATE TABLE IF NOT EXISTS "RuleEvent" (' +
      '"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, ' +
      '"ruleId" TEXT NOT NULL, ' +
      '"firedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
      '"severity" TEXT NOT NULL, ' +
      '"message" TEXT NOT NULL, ' +
      '"acked" INTEGER NOT NULL DEFAULT 0)',
  );
  db.exec('CREATE INDEX IF NOT EXISTS "RuleEvent_ruleId_firedAt_idx" ON "RuleEvent"("ruleId","firedAt")');
  ruleEventTableEnsured.add(db as unknown as object);
}

export type RuleEventRow = { id: number; ruleId: string; firedAt: string; severity: string; message: string; acked: number };
export type RuleEventInput = { ruleId: string; severity: string; message: string; firedAt?: string };

/** Record a tripwire fire. Returns the new row id. Never throws on a missing table. */
export function insertRuleEvent(db: SqlDb, e: RuleEventInput): number {
  ensureRuleEventTable(db);
  const info = db
    .prepare('INSERT INTO "RuleEvent" ("ruleId","firedAt","severity","message") VALUES (?,?,?,?)')
    .run(e.ruleId, e.firedAt ?? new Date().toISOString(), e.severity, e.message) as {
    lastInsertRowid: number | bigint;
  };
  return Number(info.lastInsertRowid);
}

/** Recent RuleEvents, newest first. Optional filter by ruleId / age window / count. */
export function recentRuleEvents(
  db: SqlDb,
  opts: { ruleId?: string; sinceDays?: number; limit?: number } = {},
): RuleEventRow[] {
  ensureRuleEventTable(db);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.ruleId) {
    clauses.push('"ruleId"=?');
    params.push(opts.ruleId);
  }
  if (opts.sinceDays !== undefined) {
    const lo = new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString();
    clauses.push('"firedAt">=?');
    params.push(lo);
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const limit = opts.limit && opts.limit > 0 ? ` LIMIT ${Math.floor(opts.limit)}` : "";
  return db
    .prepare(`SELECT "id","ruleId","firedAt","severity","message","acked" FROM "RuleEvent"${where} ORDER BY "firedAt" DESC, "id" DESC${limit}`)
    .all(...params) as RuleEventRow[];
}
