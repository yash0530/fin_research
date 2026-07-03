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

// ── Live-data layer helpers (Phase 2: jobs + backfill persistence) ───────────
//
// These back the resumable backfill tasks (BackfillProgress) and the overnight
// jobs (stats/news/earnings/rules/digest). All writes are additive + idempotent
// (INSERT OR IGNORE / COALESCE upserts) so a re-run never corrupts prior data.

const num2 = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── BackfillProgress (resumability) ──────────────────────────────────────────

/** True when this (task,symbol) was completed on a prior run. */
export function backfillIsDone(db: SqlDb, task: string, symbol: string): boolean {
  const row = db
    .prepare('SELECT "status" FROM "BackfillProgress" WHERE "task"=? AND "symbol"=?')
    .get(task, symbol.toUpperCase()) as { status: string } | undefined;
  return row?.status === "done";
}

/** Upsert a per-symbol backfill status (pending | done | error). */
export function markBackfill(
  db: SqlDb,
  task: string,
  symbol: string,
  status: "pending" | "done" | "error",
  rows = 0,
): void {
  db.prepare(
    'INSERT INTO "BackfillProgress" ("task","symbol","status","rows","updatedAt") VALUES (?,?,?,?,?) ' +
      "ON CONFLICT(\"task\",\"symbol\") DO UPDATE SET status=excluded.status, rows=excluded.rows, updatedAt=excluded.updatedAt",
  ).run(task, symbol.toUpperCase(), status, rows, new Date().toISOString());
}

// ── FundamentalsQuarter ──────────────────────────────────────────────────────

export type FundamentalsQuarterRow = {
  symbol: string;
  periodEnd: string; // YYYY-MM-DD
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  netIncome?: number | null;
  fcf?: number | null;
  capex?: number | null;
  totalAssets?: number | null;
  totalDebt?: number | null;
  cash?: number | null;
  equity?: number | null;
  sharesOut?: number | null;
};

/** Chunked INSERT OR IGNORE into FundamentalsQuarter (PK symbol+periodEnd). */
export function insertFundamentals(db: SqlDb, rows: FundamentalsQuarterRow[], chunkSize = 500): number {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO "FundamentalsQuarter" ' +
      '("symbol","periodEnd","revenue","grossProfit","operatingIncome","netIncome","fcf","capex","totalAssets","totalDebt","cash","equity","sharesOut") ' +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  for (const part of chunk(rows, chunkSize)) {
    db.exec("BEGIN");
    try {
      for (const r of part) {
        stmt.run(
          r.symbol.toUpperCase(),
          r.periodEnd,
          num2(r.revenue),
          num2(r.grossProfit),
          num2(r.operatingIncome),
          num2(r.netIncome),
          num2(r.fcf),
          num2(r.capex),
          num2(r.totalAssets),
          num2(r.totalDebt),
          num2(r.cash),
          num2(r.equity),
          num2(r.sharesOut),
        );
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return rows.length;
}

// ── EdgarFiling ──────────────────────────────────────────────────────────────

export type EdgarFilingInsert = {
  accessionNo: string;
  symbol: string;
  cik: string;
  form: string;
  filedAt: string; // YYYY-MM-DD
  primaryDoc?: string | null;
};

/** Chunked INSERT OR IGNORE into EdgarFiling (PK accessionNo). */
export function insertEdgarFilings(db: SqlDb, rows: EdgarFilingInsert[], chunkSize = 500): number {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO "EdgarFiling" ("accessionNo","symbol","cik","form","filedAt","primaryDoc") VALUES (?,?,?,?,?,?)',
  );
  for (const part of chunk(rows, chunkSize)) {
    db.exec("BEGIN");
    try {
      for (const r of part) {
        stmt.run(r.accessionNo, r.symbol.toUpperCase(), r.cik, r.form, r.filedAt, r.primaryDoc ?? null);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return rows.length;
}

/** Set a ticker's CIK (from company_tickers.json). No-op if the ticker is absent. */
export function setTickerCik(db: SqlDb, symbol: string, cik: string): void {
  db.prepare('UPDATE "Ticker" SET "cik"=? WHERE "symbol"=?').run(cik, symbol.toUpperCase());
}

// ── Ticker stats (stats job) ─────────────────────────────────────────────────

export type TickerStatUpdate = {
  symbol: string;
  price?: number | null;
  marketCap?: number | null;
  forwardPE?: number | null;
  trailingPE?: number | null;
  profitMargin?: number | null;
  revenueGrowth?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  beta?: number | null;
  eps?: number | null;
  yearChange?: number | null;
};

/**
 * Update a ticker's stat columns + statsUpdatedAt. COALESCE keeps the prior value
 * when a fresh fetch returns null (a transient miss never wipes good data).
 * Returns the number of rows changed (0 if the ticker is not present).
 */
export function upsertTickerStats(db: SqlDb, s: TickerStatUpdate): number {
  const info = db
    .prepare(
      'UPDATE "Ticker" SET ' +
        '"marketCap"=COALESCE(?,"marketCap"), "forwardPE"=COALESCE(?,"forwardPE"), ' +
        '"trailingPE"=COALESCE(?,"trailingPE"), "profitMargin"=COALESCE(?,"profitMargin"), ' +
        '"revenueGrowth"=COALESCE(?,"revenueGrowth"), "fiftyTwoWeekHigh"=COALESCE(?,"fiftyTwoWeekHigh"), ' +
        '"fiftyTwoWeekLow"=COALESCE(?,"fiftyTwoWeekLow"), "beta"=COALESCE(?,"beta"), ' +
        '"eps"=COALESCE(?,"eps"), "yearChange"=COALESCE(?,"yearChange"), "statsUpdatedAt"=? WHERE "symbol"=?',
    )
    .run(
      num2(s.marketCap),
      num2(s.forwardPE),
      num2(s.trailingPE),
      num2(s.profitMargin),
      num2(s.revenueGrowth),
      num2(s.fiftyTwoWeekHigh),
      num2(s.fiftyTwoWeekLow),
      num2(s.beta),
      num2(s.eps),
      num2(s.yearChange),
      new Date().toISOString(),
      s.symbol.toUpperCase(),
    ) as { changes: number | bigint };
  return Number(info.changes ?? 0);
}

// ── NewsItem (news job) ──────────────────────────────────────────────────────

export type NewsItemRow = {
  urlHash: string;
  url: string;
  title: string;
  snippet?: string | null;
  source?: string | null;
  sectorCode?: string | null;
  symbol?: string | null;
  publishedAt?: string | null; // ISO
};

/** Chunked INSERT OR IGNORE into NewsItem (PK urlHash → dedupe). Returns attempted. */
export function insertNewsItems(db: SqlDb, items: NewsItemRow[], chunkSize = 500): number {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO "NewsItem" ("urlHash","url","title","snippet","source","sectorCode","symbol","publishedAt","fetchedAt") VALUES (?,?,?,?,?,?,?,?,?)',
  );
  const now = new Date().toISOString();
  for (const part of chunk(items, chunkSize)) {
    db.exec("BEGIN");
    try {
      for (const it of part) {
        stmt.run(
          it.urlHash,
          it.url,
          it.title,
          it.snippet ?? null,
          it.source ?? null,
          it.sectorCode ?? null,
          it.symbol ? it.symbol.toUpperCase() : null,
          it.publishedAt ?? null,
          now,
        );
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return items.length;
}

// ── Catalyst (earnings job) ──────────────────────────────────────────────────

export type CatalystRow = {
  d?: string | null;
  kind: string;
  sectorCode?: string | null;
  symbol?: string | null;
  title: string;
  note?: string | null;
};

/**
 * Insert a catalyst unless an equivalent (kind, symbol, d) already exists — dedupe
 * so re-running the earnings job never grows the table. Returns true if inserted.
 */
export function upsertCatalyst(db: SqlDb, c: CatalystRow): boolean {
  const symbol = c.symbol ? c.symbol.toUpperCase() : null;
  const existing = db
    .prepare('SELECT "id" FROM "Catalyst" WHERE "kind"=? AND "symbol" IS ? AND "d" IS ?')
    .get(c.kind, symbol, c.d ?? null) as { id: number } | undefined;
  if (existing) return false;
  db.prepare(
    'INSERT INTO "Catalyst" ("d","kind","sectorCode","symbol","title","note") VALUES (?,?,?,?,?,?)',
  ).run(c.d ?? null, c.kind, c.sectorCode ?? null, symbol, c.title, c.note ?? null);
  return true;
}

/** Dated catalysts within [asOf, asOf+days] — feeds the digest's catalyst family. */
export function upcomingCatalysts(
  db: SqlDb,
  asOf: string,
  days: number,
): { d: string; kind: string; symbol?: string; sectorCode?: string; title: string }[] {
  const hi = new Date(new Date(`${asOf}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const rows = db
    .prepare(
      'SELECT "d","kind","symbol","sectorCode","title" FROM "Catalyst" WHERE "d" IS NOT NULL AND "d">=? AND "d"<=? ORDER BY "d" ASC',
    )
    .all(asOf, hi) as { d: string; kind: string; symbol: string | null; sectorCode: string | null; title: string }[];
  return rows.map((r) => ({
    d: r.d,
    kind: r.kind,
    title: r.title,
    ...(r.symbol ? { symbol: r.symbol } : {}),
    ...(r.sectorCode ? { sectorCode: r.sectorCode } : {}),
  }));
}

// ── JobRun (one row per overnight step) ──────────────────────────────────────

export function insertJobRun(db: SqlDb, r: { job: string; ok: boolean; detail?: string | null }): number {
  const info = db
    .prepare('INSERT INTO "JobRun" ("job","ok","detail") VALUES (?,?,?)')
    .run(r.job, r.ok ? 1 : 0, r.detail ?? null) as { lastInsertRowid: number | bigint };
  return Number(info.lastInsertRowid);
}

/** Job names that failed since `sinceDays` ago — feeds the digest data-health family. */
export function failedJobRunsSince(db: SqlDb, sinceDays = 1): string[] {
  const lo = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const rows = db
    .prepare('SELECT DISTINCT "job" FROM "JobRun" WHERE "ok"=0 AND "startedAt">=? ORDER BY "job"')
    .all(lo) as { job: string }[];
  return rows.map((r) => r.job);
}

// ── Universe selectors (which symbols a job runs over) ───────────────────────

export function activeSymbols(db: SqlDb): string[] {
  const rows = db
    .prepare('SELECT "symbol" FROM "Ticker" WHERE "active"=1 ORDER BY "symbol"')
    .all() as { symbol: string }[];
  return rows.map((r) => r.symbol);
}

export function watchlistSymbols(db: SqlDb): string[] {
  const rows = db
    .prepare('SELECT "symbol" FROM "Ticker" WHERE "watchlisted"=1 ORDER BY "symbol"')
    .all() as { symbol: string }[];
  return rows.map((r) => r.symbol);
}

/** Symbols that carry a CIK (ready for the EDGAR submissions backfill). */
export function symbolsWithCik(db: SqlDb): { symbol: string; cik: string }[] {
  const rows = db
    .prepare('SELECT "symbol","cik" FROM "Ticker" WHERE "cik" IS NOT NULL ORDER BY "symbol"')
    .all() as { symbol: string; cik: string }[];
  return rows;
}

// ── Market-input reads (feed src/research/market-inputs.buildMarketInputs) ────
//
// Bulk/dated price reads the per-symbol `loadCloses` can't express (breadth needs
// a whole-universe scan; credit needs date-aligned pairs; data-health needs the
// latest bar per symbol). Callers despike the raw closes via ../lib/metrics — the
// window here is intentionally raw+dated so the caller controls the hygiene pass.

/** The newest price date in the book, or null when the Price table is empty. */
export function maxPriceDate(db: SqlDb): string | null {
  const row = db.prepare('SELECT MAX("d") AS d FROM "Price"').get() as { d: string | null } | undefined;
  return row?.d ?? null;
}

/** Raw (symbol, d, close) rows on/after `sinceD`, ordered by symbol then date — the
 *  caller groups per symbol and despikes. Window covers the widest metric (50-dma). */
export function closesSince(db: SqlDb, sinceD: string): { symbol: string; d: string; close: number }[] {
  return db
    .prepare('SELECT "symbol","d","close" FROM "Price" WHERE "d">=? ORDER BY "symbol" ASC, "d" ASC')
    .all(sinceD) as { symbol: string; d: string; close: number }[];
}

/** Latest bar date per symbol across ALL history — feeds the stale-price count
 *  (a delisted straggler's last bar can predate any metric window). */
export function latestBarDates(db: SqlDb): { symbol: string; d: string }[] {
  return db
    .prepare('SELECT "symbol", MAX("d") AS d FROM "Price" GROUP BY "symbol"')
    .all() as { symbol: string; d: string }[];
}

/** The `n` most-recent distinct trading dates, newest first — the trading-day ruler
 *  used to measure how many sessions a symbol's last bar lags the book. */
export function recentTradingDates(db: SqlDb, n: number): string[] {
  const rows = db
    .prepare('SELECT DISTINCT "d" FROM "Price" ORDER BY "d" DESC LIMIT ?')
    .all(Math.max(1, Math.floor(n))) as { d: string }[];
  return rows.map((r) => r.d);
}

/** Active-ticker sector memberships tagged with each sector's taxonomy — drives the
 *  gics_pulse / ai_pulse split and the ai_* divergence baskets. */
export function activeSectorMemberships(db: SqlDb): { symbol: string; sectorCode: string; taxonomy: string }[] {
  return db
    .prepare(
      'SELECT ts."symbol" AS symbol, ts."sectorCode" AS sectorCode, s."taxonomy" AS taxonomy ' +
        'FROM "TickerSector" ts ' +
        'JOIN "Ticker" t ON t."symbol"=ts."symbol" ' +
        'JOIN "Sector" s ON s."code"=ts."sectorCode" ' +
        'WHERE t."active"=1',
    )
    .all() as { symbol: string; sectorCode: string; taxonomy: string }[];
}
