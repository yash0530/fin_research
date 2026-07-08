// Builds a throw-away fixture SQLite DB for the Playwright smoke suite: applies
// every `prisma/migrations/*.sql` through the real runner (`src/db/migrate.ts`,
// same code path as `scripts/apply-migration.ts`), then seeds a small, realistic
// slice of the universe via the tested `src/db/queries.ts` helpers — 3 tickers
// (prices ~300 sessions, ~12 fundamentals quarters, one with an ai_* AND a g_*
// sector link), 1 WatchlistEntry, 1 Candidate (INBOX), 1 JournalEntry, 1 Position,
// 1 RecCall — so the 5 routes render real panels, not just empty states.
//
// NEVER touches data/engine.db: callers always pass an explicit tmp path
// (see `env.ts`'s `DB_PATH`, under `os.tmpdir()`).
//
// Runnable directly for local debugging: `npx tsx web/e2e/fixture-db.ts <path>`.
import { readFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { applyMigrations, type SqlDb } from "../../src/db/migrate";
import {
  insertSectors,
  upsertTicker,
  linkTickerSector,
  insertPrices,
  insertFundamentals,
  saveRecCall,
  upsertPosition,
} from "../../src/db/queries";
import type { RecCall } from "../../src/dossier/state";

import {
  PRIMARY_SYMBOL,
  SECONDARY_SYMBOL,
  TERTIARY_SYMBOL,
  AI_SECTOR_CODE,
  GICS_SECTOR_CODE_PRIMARY,
  GICS_SECTOR_CODE_SECONDARY,
} from "./fixture-data";

function repoRoot(): string {
  // web/e2e/fixture-db.ts -> web/e2e -> web -> repo root. Uses __dirname (not
  // import.meta.url) so this file works both under Playwright's CJS transform
  // AND a direct `tsx web/e2e/fixture-db.ts` CLI invocation (tsx polyfills
  // __dirname in its ESM mode too).
  return join(__dirname, "..", "..");
}

function loadMigrations(): { name: string; sql: string }[] {
  const dir = join(repoRoot(), "prisma", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f.replace(/\.sql$/, ""), sql: readFileSync(join(dir, f), "utf8") }));
}

/** Business-day dates going back `count` sessions from today (inclusive), oldest→newest. */
function tradingDates(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  while (out.length < count) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.reverse();
}

/** Deterministic smooth-ish random walk closes (no wild spikes — despike-friendly). */
function walkCloses(count: number, start: number, seed: number): number[] {
  let price = start;
  let s = seed;
  const rand = (): number => {
    // xorshift32 — deterministic per seed, no external dependency.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s |= 0;
    return ((s >>> 0) / 4294967295) * 2 - 1; // [-1, 1]
  };
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    price = Math.max(1, price * (1 + rand() * 0.015));
    out.push(Math.round(price * 100) / 100);
  }
  return out;
}

/** Quarter-end dates, oldest→newest, `count` quarters back from the most recent one. */
function quarterEnds(count: number): string[] {
  const ends = ["-03-31", "-06-30", "-09-30", "-12-31"];
  const now = new Date();
  let year = now.getUTCFullYear();
  let qIdx = Math.floor(now.getUTCMonth() / 3); // 0..3, most recently CLOSED quarter
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.unshift(`${year}${ends[qIdx]}`);
    qIdx -= 1;
    if (qIdx < 0) {
      qIdx = 3;
      year -= 1;
    }
  }
  return out;
}

function seedTickerPrices(db: SqlDb, symbol: string, days: number, startPrice: number, seed: number): void {
  const dates = tradingDates(days);
  const closes = walkCloses(days, startPrice, seed);
  insertPrices(
    db,
    dates.map((d, i) => ({ symbol, d, close: closes[i], volume: 1_000_000 + (i % 50) * 10_000 })),
  );
}

/** 12 clean, fully-computable fundamentals quarters: steady growth, positive CFO
 * above net income, deleveraging, share count flat-to-shrinking — gives the
 * on-the-fly screens (F-Score / accruals / dilution) real pass/fail signal
 * instead of "unknown" warnings. */
function seedTickerFundamentals(db: SqlDb, symbol: string, quarters = 12): void {
  const periods = quarterEnds(quarters);
  const rows = periods.map((periodEnd, i) => {
    const revenue = 500_000_000 * (1 + i * 0.03);
    const grossProfit = revenue * 0.55;
    const operatingIncome = revenue * 0.2;
    const netIncome = revenue * 0.15;
    const cfo = netIncome * 1.2;
    const sharesOut = 200_000_000 - i * 200_000; // mild buyback → dilution pass
    return {
      symbol,
      periodEnd,
      revenue,
      grossProfit,
      operatingIncome,
      netIncome,
      fcf: cfo - revenue * 0.05,
      capex: revenue * 0.05,
      totalAssets: 2_000_000_000 * (1 + i * 0.01),
      totalDebt: 400_000_000 * (1 - i * 0.01), // deleveraging → leverage pass
      cash: 300_000_000 + i * 5_000_000,
      equity: 1_200_000_000 * (1 + i * 0.01),
      sharesOut,
      cfo,
      sga: revenue * 0.15,
      depreciation: revenue * 0.03,
      receivables: revenue * 0.1,
      currentAssets: 600_000_000 * (1 + i * 0.01),
      currentLiabilities: 250_000_000 * (1 - i * 0.002), // liquidity pass
      retainedEarnings: 500_000_000 + i * 20_000_000,
      ppe: 700_000_000 * (1 + i * 0.01),
    };
  });
  insertFundamentals(db, rows);
}

function nowIso(): string {
  return new Date().toISOString();
}

function seedWatchlistEntry(db: SqlDb, symbol: string, closes: number[]): void {
  const latestClose = closes[closes.length - 1];
  const iso = nowIso();
  db.prepare(
    'INSERT INTO "WatchlistEntry" ("symbol","userLocked","buyUnder","valueBase","valueLow","valueHigh","thesis","disconfirming","createdAt","updatedAt") ' +
      "VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).run(
    symbol,
    1,
    Math.round(latestClose * 0.9 * 100) / 100,
    Math.round(latestClose * 100) / 100,
    Math.round(latestClose * 0.85 * 100) / 100,
    Math.round(latestClose * 1.15 * 100) / 100,
    "E2E fixture thesis: steady TTM growth, deleveraging balance sheet.",
    "E2E fixture disconfirming note: two consecutive quarters of margin compression.",
    iso,
    iso,
  );
}

function seedCandidate(db: SqlDb, symbol: string): void {
  db.prepare(
    'INSERT INTO "Candidate" ("symbol","tier","triggerTags","qualification","computedAt","userState") VALUES (?,?,?,?,?,?)',
  ).run(
    symbol,
    1,
    JSON.stringify(["insider_cluster", "earnings_beat"]),
    JSON.stringify({ passed: ["fscore", "accruals"], failed: [] }),
    nowIso(),
    "INBOX",
  );
}

function seedJournalEntry(db: SqlDb, symbol: string): void {
  db.prepare('INSERT INTO "JournalEntry" ("symbol","action","thesis","invalidation","createdAt") VALUES (?,?,?,?,?)').run(
    symbol,
    "BUY",
    "E2E fixture journal entry: initiated on steady TTM growth + insider cluster.",
    "Would exit on a break below the 200d despiked close or a 4.02 filing.",
    nowIso(),
  );
}

function seedRecCall(db: SqlDb, symbol: string, priceAtCall: number): void {
  const r: RecCall = {
    dossierId: `e2e-fixture-${symbol}`,
    symbol,
    action: "BUY",
    conviction: "MEDIUM",
    priceAtCall,
    targetLow: Math.round(priceAtCall * 1.1 * 100) / 100,
    targetHigh: Math.round(priceAtCall * 1.3 * 100) / 100,
    stopPrice: Math.round(priceAtCall * 0.85 * 100) / 100,
    judgeSizePct: 3,
    governedSizePct: 2,
    governorReason: "capped at 2% — tier not yet calibrated",
    model: "e2e-fixture",
    thinkingMode: false,
    promptVersion: "v1",
    createdAt: Date.now(),
    outcome1mPct: null,
    outcome3mPct: null,
    outcome6mPct: null,
    outcome1yPct: null,
    thesisFalsified: null,
  };
  saveRecCall(db, r);
}

export function buildFixtureDb(dbPath: string): void {
  if (existsSync(dbPath)) unlinkSync(dbPath);
  mkdirSync(dirname(dbPath), { recursive: true });

  const raw = new DatabaseSync(dbPath);
  raw.exec("PRAGMA journal_mode=WAL;");
  raw.exec("PRAGMA busy_timeout=8000;");
  const db = raw as unknown as SqlDb;

  applyMigrations(db, loadMigrations());

  insertSectors(db, [
    { code: GICS_SECTOR_CODE_PRIMARY, name: "Information Technology", taxonomy: "gics", driver: 0 },
    { code: GICS_SECTOR_CODE_SECONDARY, name: "Industrials", taxonomy: "gics", driver: 0 },
    { code: AI_SECTOR_CODE, name: "Compute / GPU", taxonomy: "ai_infra", driver: 1 },
  ]);

  // PRIMARY: ai_* + g_* dual-linked, watchlisted, held, journal-logged.
  upsertTicker(db, { symbol: PRIMARY_SYMBOL, name: "Test Alpha Corp", source: "e2e-fixture", watchlisted: true, marketCap: 5e10, forwardPE: 22.5 });
  linkTickerSector(db, PRIMARY_SYMBOL, GICS_SECTOR_CODE_PRIMARY);
  linkTickerSector(db, PRIMARY_SYMBOL, AI_SECTOR_CODE);

  // SECONDARY / TERTIARY: plainer GICS-only names for list/rank variety.
  upsertTicker(db, { symbol: SECONDARY_SYMBOL, name: "Test Beta Industrials", source: "e2e-fixture", marketCap: 8e9, forwardPE: 15.1 });
  linkTickerSector(db, SECONDARY_SYMBOL, GICS_SECTOR_CODE_SECONDARY);

  upsertTicker(db, { symbol: TERTIARY_SYMBOL, name: "Test Gamma Systems", source: "e2e-fixture", marketCap: 1.2e10, forwardPE: 18.4 });
  linkTickerSector(db, TERTIARY_SYMBOL, GICS_SECTOR_CODE_PRIMARY);

  const seeds: { symbol: string; start: number; seed: number }[] = [
    { symbol: PRIMARY_SYMBOL, start: 120, seed: 12345 },
    { symbol: SECONDARY_SYMBOL, start: 60, seed: 67890 },
    { symbol: TERTIARY_SYMBOL, start: 90, seed: 24680 },
  ];
  const closesBySymbol = new Map<string, number[]>();
  for (const s of seeds) {
    seedTickerPrices(db, s.symbol, 300, s.start, s.seed);
    seedTickerFundamentals(db, s.symbol, 12);
    closesBySymbol.set(s.symbol, walkCloses(300, s.start, s.seed));
  }

  seedWatchlistEntry(db, PRIMARY_SYMBOL, closesBySymbol.get(PRIMARY_SYMBOL)!);
  seedCandidate(db, PRIMARY_SYMBOL);
  seedJournalEntry(db, PRIMARY_SYMBOL);
  upsertPosition(db, { symbol: PRIMARY_SYMBOL, qty: 25, avgCost: closesBySymbol.get(PRIMARY_SYMBOL)![0], openedAt: tradingDates(300)[0] });
  seedRecCall(db, PRIMARY_SYMBOL, closesBySymbol.get(PRIMARY_SYMBOL)!.at(-1)!);

  raw.close();
}

// CLI entry point: `npx tsx web/e2e/fixture-db.ts <path>` (local debugging only —
// the suite itself calls `buildFixtureDb` from `global-setup.ts`). A path-suffix
// check (not `require.main`/`import.meta.url`) so this works whether the file is
// loaded as CJS (Playwright's transform) or ESM (a direct tsx invocation).
const isMain = /fixture-db\.(ts|js|mjs|cjs)$/.test(process.argv[1] ?? "");
if (isMain) {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error("Usage: tsx web/e2e/fixture-db.ts <path-to-sqlite-file>");
    process.exit(1);
  }
  buildFixtureDb(dbPath);
  console.log(`✓ fixture DB built at ${dbPath}`);
}
