import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { applyMigrations, type SqlDb } from "./migrate";
import { insertSectors, upsertTicker, linkTickerSector, countRows } from "./queries";
import { seedUniverse } from "./seed-helpers";
import { GICS_SEEDS, AI_INFRA_SEEDS } from "../config/sectors";
import { parseUniverseCsv } from "../lib/universe";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const INIT = readFileSync("prisma/migrations/0001_init.sql", "utf8");

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, [{ name: "0001_init", sql: INIT }]);
  return db;
}

describe("seed helpers", () => {
  it("inserts the dual-taxonomy sectors (11 GICS + 12 AI = 23)", () => {
    const db = migratedDb();
    insertSectors(db, [...GICS_SEEDS, ...AI_INFRA_SEEDS]);
    expect(countRows(db, "Sector")).toBe(23);
    insertSectors(db, GICS_SEEDS); // idempotent (INSERT OR IGNORE)
    expect(countRows(db, "Sector")).toBe(23);
  });

  it("upserts tickers idempotently and links them to sectors", () => {
    const db = migratedDb();
    insertSectors(db, [...GICS_SEEDS, ...AI_INFRA_SEEDS]);
    upsertTicker(db, { symbol: "mu", name: "Micron", watchlisted: true });
    upsertTicker(db, { symbol: "MU", name: "Micron Technology", watchlisted: true }); // upsert, not dup
    expect(countRows(db, "Ticker")).toBe(1);
    const row = db.prepare('SELECT name, watchlisted FROM "Ticker" WHERE symbol=?').get("MU") as { name: string; watchlisted: number };
    expect(row.name).toBe("Micron Technology");
    expect(row.watchlisted).toBe(1);

    linkTickerSector(db, "MU", "g_info_tech");
    linkTickerSector(db, "MU", "ai_memory");
    linkTickerSector(db, "MU", "ai_memory"); // dup ignored
    expect(countRows(db, "TickerSector")).toBe(2);
  });

  it("seeds the full universe: GICS links + additive ai_* links, idempotently", () => {
    const db = migratedDb();
    insertSectors(db, [...GICS_SEEDS, ...AI_INFRA_SEEDS]);
    const universe = parseUniverseCsv(
      [
        "ticker,company_name,sector,industry",
        "MU,Micron Technology,Information Technology,Semiconductors",
        "NVDA,NVIDIA,Information Technology,Semiconductors",
        "JPM,JPMorgan Chase,Financials,Banks",
      ].join("\n"),
    );
    // MU is in both S&P and AI (dedupe → additive link); TSM is AI-only (new ticker).
    const aiLinks = [
      { symbol: "MU", code: "ai_memory" },
      { symbol: "NVDA", code: "ai_compute_gpu" },
      { symbol: "TSM", code: "ai_foundry" },
      { symbol: "TSM", code: "ai_compute_gpu" },
    ];
    const r = seedUniverse(db, {
      universe,
      aiLinks,
      benchmarks: [{ symbol: "HYG", name: "HY ETF" }],
    });

    expect(r.spTickers).toBe(3);
    expect(r.spLinks).toBe(3); // all three map to a GICS code
    expect(r.aiTickers).toBe(1); // only TSM is new (MU/NVDA already S&P)
    expect(r.aiLinks).toBe(4);
    expect(r.benchmarkTickers).toBe(1);

    expect(countRows(db, "Ticker")).toBe(5); // MU, NVDA, JPM, TSM, HYG
    expect(countRows(db, "TickerSector")).toBe(7); // 3 GICS + 4 ai_*

    // An S&P name is never clobbered by the additive AI upsert.
    const mu = db.prepare('SELECT name FROM "Ticker" WHERE symbol=?').get("MU") as { name: string };
    expect(mu.name).toBe("Micron Technology");

    // Idempotent: a second identical seed adds no rows.
    seedUniverse(db, { universe, aiLinks, benchmarks: [{ symbol: "HYG", name: "HY ETF" }] });
    expect(countRows(db, "Ticker")).toBe(5);
    expect(countRows(db, "TickerSector")).toBe(7);
  });
});
