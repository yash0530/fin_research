import { describe, it, expect } from "vitest";
import { jobCatalog, buildLiveRegistry, type JobEntry } from "./registry-live";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { applyMigrations, type SqlDb } from "../db/migrate";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

function loadMigrations(): { name: string; sql: string }[] {
  const dir = "prisma/migrations";
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      name: f.replace(/\.sql$/, ""),
      sql: readFileSync(join(dir, f), "utf8"),
    }));
}

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, loadMigrations());
  return db;
}

// The registry must ASSEMBLE offline (no DB, no network). We only assert the
// shape/metadata here; the `run` bodies build live fetchers lazily and are exercised
// against real services by the CLI, never in vitest.
describe("live registry assembly", () => {
  const EXPECTED = [
    "prices10y",
    "fundamentals",
    "edgar_index",
    "edgar_facts",
    "stats",
    "news",
    "earnings",
    "rules",
    "digest",
    "overnight",
    "refresh_data",
    "dossier",
    "story",
    "backup",
    "buylist_draft",
    "outcomes",
    "campaign",
    "universe_check",
    "integrity_check",
    "backtest",
    "portfolio_check",
    "screens",
  ];

  it("jobCatalog lists every job with a describe, no DB required", () => {
    const cat = jobCatalog();
    expect(cat.map((j) => j.name)).toEqual(EXPECTED);
    for (const j of cat) expect(j.describe.length).toBeGreaterThan(0);
  });

  it("includes the new backup job", () => {
    expect(jobCatalog().map((j) => j.name)).toContain("backup");
  });

  it("buildLiveRegistry(db) binds db in and preserves names/order + runnable entries", () => {
    const db = migratedDb();
    const reg: JobEntry[] = buildLiveRegistry(db);
    expect(reg.map((j) => j.name)).toEqual(EXPECTED);
    for (const j of reg) expect(typeof j.run).toBe("function");
    // Catalog and bound registry are single-sourced (same names, same describes).
    expect(reg.map((j) => j.describe)).toEqual(jobCatalog().map((j) => j.describe));
  });

  it("screens job should compute metrics and upsert Candidates in memory DB", async () => {
    const db = migratedDb();
    const reg = buildLiveRegistry(db);
    const screensJob = reg.find((j) => j.name === "screens");
    expect(screensJob).toBeDefined();

    // Seed mock Sector, Ticker and TickerSector
    db.prepare('INSERT INTO "Sector" ("code", "name", "taxonomy") VALUES (?, ?, ?)').run("g_info_tech", "Information Technology", "gics");
    db.prepare('INSERT INTO "Ticker" ("symbol", "class", "active", "marketCap") VALUES (?, ?, ?, ?)').run("AAPL", "stock", 1, 2000000000);
    db.prepare('INSERT INTO "TickerSector" ("symbol", "sectorCode") VALUES (?, ?)').run("AAPL", "g_info_tech");

    // Seed 30 quarters of mock FundamentalsQuarter
    const stmt = db.prepare(
      'INSERT INTO "FundamentalsQuarter" ' +
      '("symbol", "periodEnd", "revenue", "grossProfit", "operatingIncome", "netIncome", "fcf", "totalAssets", "totalDebt", "cash", "sharesOut", "cfo", "currentAssets", "currentLiabilities") ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const dates: string[] = [];
    for (let year = 2018; year <= 2025; year++) {
      for (const month of ["03", "06", "09", "12"]) {
        dates.push(`${year}-${month}-31`);
      }
    }
    const targetDates = dates.slice(0, 30);

    for (let i = 0; i < targetDates.length; i++) {
      // Simulate non-periodic EPS variation to avoid 0 standard deviation in earnings trend
      const val = 1.0 + Math.sin(i) * 0.1;
      stmt.run(
        "AAPL",
        targetDates[i],
        1000,           // revenue
        600,            // grossProfit
        200,            // operatingIncome
        val * 100,      // netIncome
        80,             // fcf
        5000,           // totalAssets
        1000,           // totalDebt
        500,            // cash
        100,            // sharesOut
        150,            // cfo
        1500,           // currentAssets
        1000            // currentLiabilities
      );
    }

    const outcome = await screensJob!.run(["AAPL"]);
    expect(outcome.ok).toBe(true);

    const candidates = db.prepare('SELECT * FROM "Candidate" WHERE "symbol"=?').all("AAPL") as any[];
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate.symbol).toBe("AAPL");
    expect(candidate.userState).toBe("INBOX");
    expect(typeof candidate.qualification).toBe("string");
    const qual = JSON.parse(candidate.qualification);
    expect(qual).toHaveProperty("fscore");
    expect(qual).toHaveProperty("accruals");
    expect(qual).toHaveProperty("dilution");
    expect(qual).toHaveProperty("cohort");
    expect(qual).toHaveProperty("earningsTrend");
  });
});

