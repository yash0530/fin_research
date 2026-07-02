import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { applyMigrations, type SqlDb } from "./migrate";
import { insertSectors, upsertTicker, linkTickerSector, countRows } from "./queries";
import { GICS_SEEDS, AI_INFRA_SEEDS } from "../config/sectors";

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
});
