import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { applyMigrations, type SqlDb } from "../db/migrate";
import { saveDigest } from "../db/queries";
import { evaluateCatchUp, schedulerTick } from "./tick";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const INIT = readFileSync("prisma/migrations/0001_init.sql", "utf8");

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, [{ name: "0001_init", sql: INIT }]);
  return db;
}

// A fixed instant; the window is widened to [0,23] so the local-hour guard never
// interferes and `due` depends purely on whether today's digest exists.
const NOW = new Date("2026-07-02T15:00:00Z");
const TODAY = "2026-07-02";
const ALL_DAY = { windowStartHour: 0, windowEndHour: 23 };

describe("evaluateCatchUp (read-only decision)", () => {
  it("no digest at all ⇒ due", () => {
    const db = migratedDb();
    const d = evaluateCatchUp(db, NOW, ALL_DAY);
    expect(d.lastDigestDate).toBeNull();
    expect(d.marketDate).toBe(TODAY);
    expect(d.due).toBe(true);
  });

  it("today's digest present ⇒ not due (short-circuit)", () => {
    const db = migratedDb();
    saveDigest(db, { d: TODAY, dataJson: '{"headline":"today"}' });
    const d = evaluateCatchUp(db, NOW, ALL_DAY);
    expect(d.lastDigestDate).toBe(TODAY);
    expect(d.due).toBe(false);
  });

  it("yesterday's digest ⇒ due (we owe today's)", () => {
    const db = migratedDb();
    saveDigest(db, { d: "2026-07-01", dataJson: "{}" });
    expect(evaluateCatchUp(db, NOW, ALL_DAY).due).toBe(true);
  });

  it("outside the morning window ⇒ not due even with no digest", () => {
    const db = migratedDb();
    const hour = NOW.getHours();
    // Build a window that provably excludes NOW's local hour.
    const window = hour === 23 ? { windowStartHour: 0, windowEndHour: 22 } : { windowStartHour: hour + 1, windowEndHour: 23 };
    expect(evaluateCatchUp(db, NOW, window).due).toBe(false);
  });
});

describe("schedulerTick (one live decision tick)", () => {
  it("no-digest in the window → runs the chain, not the drain", async () => {
    const db = migratedDb();
    let chain = 0;
    let drain = 0;
    const res = await schedulerTick({
      db,
      now: () => NOW,
      window: ALL_DAY,
      runChain: async () => { chain += 1; },
      drainDossier: async () => { drain += 1; },
    });
    expect(res.due).toBe(true);
    expect(res.caughtUp).toBe(true);
    expect(res.drained).toBe(false);
    expect(chain).toBe(1);
    expect(drain).toBe(0);
  });

  it("today's digest present → short-circuits chain, drains dossiers (idle path)", async () => {
    const db = migratedDb();
    saveDigest(db, { d: TODAY, dataJson: '{"headline":"today"}' });
    let chain = 0;
    let drain = 0;
    const res = await schedulerTick({
      db,
      now: () => NOW,
      window: ALL_DAY,
      runChain: async () => { chain += 1; },
      drainDossier: async () => { drain += 1; },
    });
    expect(res.caughtUp).toBe(false);
    expect(res.drained).toBe(true);
    expect(chain).toBe(0); // chain short-circuited
    expect(drain).toBe(1); // idle path drained
  });
});
