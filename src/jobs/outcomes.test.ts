import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { SqlDb } from "../db/migrate";
import { applyMigrations } from "../db/migrate";
import { runOutcomesJob } from "./outcomes";

// node:sqlite via createRequire (vite-safe), matching the repo's other DB tests.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

function freshDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  const migrations = readdirSync("prisma/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name: name.replace(/\.sql$/, ""), sql: readFileSync(join("prisma/migrations", name), "utf8") }));
  applyMigrations(db, migrations);
  return db;
}

const CALL_MS = Date.parse("2026-05-01T12:00:00Z");
const NOW_MS = Date.parse("2026-07-03T12:00:00Z"); // ~2 months later → 1m due, 3m not

describe("outcomes job", () => {
  let db: SqlDb;
  beforeEach(() => {
    db = freshDb();
    db.prepare(
      `INSERT INTO RecCall (dossierId, symbol, action, conviction, priceAtCall, judgeSizePct, governedSizePct, createdAt)
       VALUES ('dsr_T_1', 'TTT', 'BUY', 'MEDIUM', 100, 3, 2, ?)`,
    ).run(CALL_MS);
    const ins = db.prepare(`INSERT INTO Price (symbol, d, close) VALUES ('TTT', ?, ?)`);
    ins.run("2026-06-01", 110); // 1m target date close → +10%
    ins.run("2026-07-01", 120);
  });

  it("fills due horizons from local closes and leaves not-yet-due null", () => {
    const detail = runOutcomesJob(db, { now: () => NOW_MS });
    expect(detail).toContain("1 filled");
    const row = db
      .prepare(`SELECT outcome1mPct, outcome3mPct FROM RecCall WHERE symbol='TTT'`)
      .get() as { outcome1mPct: number | null; outcome3mPct: number | null };
    expect(row.outcome1mPct).toBe(10);
    expect(row.outcome3mPct).toBeNull(); // Aug 1 hasn't arrived
  });

  it("is idempotent once filled", () => {
    runOutcomesJob(db, { now: () => NOW_MS });
    expect(runOutcomesJob(db, { now: () => NOW_MS })).toContain("0 filled");
  });

  it("missing price history is a counted no-op, not a crash", () => {
    db.prepare(
      `INSERT INTO RecCall (dossierId, symbol, action, conviction, priceAtCall, judgeSizePct, governedSizePct, createdAt)
       VALUES ('dsr_N_1', 'NOPX', 'BUY', 'LOW', 50, 1, 1, ?)`,
    ).run(CALL_MS);
    expect(() => runOutcomesJob(db, { now: () => NOW_MS })).not.toThrow();
  });
});
