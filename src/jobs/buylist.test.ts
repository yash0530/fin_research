import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { SqlDb } from "../db/migrate";
import { applyMigrations } from "../db/migrate";
import { runBuyListJob, candidatesFromRecCalls } from "./buylist";

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

const NOW = Date.parse("2026-07-03T12:00:00Z");

function recCall(db: SqlDb, symbol: string, action: string, conviction: string, judge: number, governed: number, createdAt = NOW - 5 * 86_400_000): void {
  db.prepare(
    `INSERT INTO RecCall (dossierId, symbol, action, conviction, priceAtCall, judgeSizePct, governedSizePct, governorReason, createdAt)
     VALUES (?, ?, ?, ?, 100, ?, ?, 'r', ?)`,
  ).run(`dsr_${symbol}_${createdAt}`, symbol, action, conviction, judge, governed, createdAt);
}

describe("buylist_draft job", () => {
  let db: SqlDb;
  beforeEach(() => {
    db = freshDb();
  });

  it("drafts a month from BUY RecCalls; sub-lot governed sizes are skipped honestly", () => {
    // Governed 8% of $2,500 = $200 (buyable); governed 2% = $50 < $100 min lot (skipped).
    recCall(db, "NVDA", "BUY", "MEDIUM", 3, 2);
    recCall(db, "AVGO", "BUY", "HIGH", 8, 8);
    recCall(db, "MU", "AVOID", "LOW", 0, 0); // not a BUY → excluded
    const detail = runBuyListJob(db, { month: "2026-07", now: () => NOW });
    expect(detail).toContain("buylist 2026-07");
    const items = db.prepare(`SELECT symbol, rank, plannedUsd, skipped FROM BuyListItem ORDER BY rank`).all() as {
      symbol: string;
      rank: number;
      plannedUsd: number;
      skipped: number;
    }[];
    expect(items.map((i) => i.symbol)).toEqual(["AVGO", "NVDA"]); // HIGH ranks first
    expect(items[0].skipped).toBe(0);
    expect(items[0].plannedUsd).toBeGreaterThanOrEqual(100);
    expect(items[1].skipped).toBe(1); // $50 lot < $100 minimum — the unproven-tier reality at $2,500/mo
  });

  it("stale calls fall out of the candidate window", () => {
    recCall(db, "OLD", "BUY", "HIGH", 5, 2, NOW - 90 * 86_400_000);
    runBuyListJob(db, { month: "2026-07", now: () => NOW });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM BuyListItem`).get()).toEqual({ n: 0 });
  });

  it("re-running replaces the draft; a finalized month is never touched", () => {
    recCall(db, "NVDA", "BUY", "MEDIUM", 3, 2);
    runBuyListJob(db, { month: "2026-07", now: () => NOW });
    runBuyListJob(db, { month: "2026-07", now: () => NOW });
    expect((db.prepare(`SELECT COUNT(*) AS n FROM BuyListItem`).get() as { n: number }).n).toBe(1);
    db.prepare(`UPDATE BuyList SET status = 'final' WHERE month = '2026-07'`).run();
    const detail = runBuyListJob(db, { month: "2026-07", now: () => NOW });
    expect(detail).toContain("already final");
  });

  it("newest call per symbol wins", () => {
    recCall(db, "NVDA", "AVOID", "LOW", 0, 0, NOW - 10 * 86_400_000);
    recCall(db, "NVDA", "BUY", "MEDIUM", 3, 2, NOW - 1 * 86_400_000);
    const c = candidatesFromRecCalls(db, NOW);
    expect(c.filter((x) => x.symbol === "NVDA")).toHaveLength(1);
    expect(c[0].action).toBe("BUY");
    expect(c[0].ageDays).toBe(1);
  });
});
