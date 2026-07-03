import { describe, it, expect } from "vitest";
import { jobCatalog, buildLiveRegistry, type JobEntry } from "./registry-live";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { applyMigrations, type SqlDb } from "../db/migrate";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const INIT = readFileSync("prisma/migrations/0001_init.sql", "utf8");

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, [{ name: "0001_init", sql: INIT }]);
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
    "stats",
    "news",
    "earnings",
    "rules",
    "digest",
    "overnight",
    "dossier",
    "backup",
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
});
