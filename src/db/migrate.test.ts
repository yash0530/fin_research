import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { applyMigrations, appliedMigrations, type SqlDb } from "./migrate";

// node:sqlite is newer than Vite's builtin list, so a static ESM import breaks
// collection under vitest. A runtime require (createRequire) bypasses Vite's
// static resolver while `as typeof import(...)` keeps full types.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
type Db = InstanceType<typeof DatabaseSync>;

// Proves the full path schema.prisma → 0001_init.sql → a real SQLite database.
const initSql = readFileSync("prisma/migrations/0001_init.sql", "utf8");

function tableCount(db: Db): number {
  const row = db
    .prepare(
      "SELECT count(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'",
    )
    .get() as { c: number };
  return row.c;
}

describe("applyMigrations against a real SQLite DB (node:sqlite)", () => {
  it("materializes all 30 tables from the generated init migration", () => {
    const db = new DatabaseSync(":memory:");
    const applied = applyMigrations(db as unknown as SqlDb, [{ name: "0001_init", sql: initSql }]);
    expect(applied).toEqual(["0001_init"]);
    expect(tableCount(db)).toBe(30);
    db.close();
  });

  it("is idempotent — a second run applies nothing", () => {
    const db = new DatabaseSync(":memory:");
    applyMigrations(db as unknown as SqlDb, [{ name: "0001_init", sql: initSql }]);
    const again = applyMigrations(db as unknown as SqlDb, [{ name: "0001_init", sql: initSql }]);
    expect(again).toEqual([]);
    expect(appliedMigrations(db as unknown as SqlDb)).toEqual(["0001_init"]);
    expect(tableCount(db)).toBe(30); // unchanged
    db.close();
  });

  it("can insert and read back a row (schema is actually usable)", () => {
    const db = new DatabaseSync(":memory:");
    applyMigrations(db as unknown as SqlDb, [{ name: "0001_init", sql: initSql }]);
    db.prepare('INSERT INTO "Sector" (code, name, taxonomy, driver, stage) VALUES (?,?,?,?,?)').run(
      "ai_memory",
      "Memory (HBM/DRAM/NAND)",
      "ai_infra",
      2,
      "inflecting",
    );
    const row = db.prepare('SELECT name FROM "Sector" WHERE code = ?').get("ai_memory") as {
      name: string;
    };
    expect(row.name).toContain("Memory");
    db.close();
  });
});
