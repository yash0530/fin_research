import { describe, it, expect } from "vitest";
import { splitSuspects, flatRuns, gaps, runIntegrityJob, type Bar } from "./integrity";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { applyMigrations, type SqlDb } from "../db/migrate";
import { insertPrices } from "../db/queries";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const INIT = readFileSync("prisma/migrations/0001_init.sql", "utf8");

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, [{ name: "0001_init", sql: INIT }]);
  return db;
}

describe("integrity detectors", () => {
  it("clean series has no findings", () => {
    const bars: Bar[] = [
      { d: "2026-06-01", close: 100 },
      { d: "2026-06-02", close: 102 },
      { d: "2026-06-03", close: 101 },
      { d: "2026-06-04", close: 103 },
      { d: "2026-06-05", close: 102 },
    ];

    expect(splitSuspects(bars)).toEqual([]);
    expect(flatRuns(bars, 3)).toEqual([]);
    expect(gaps(bars, 5)).toEqual([]);
  });

  it("detects stock splits (down and up) and ignores transient spikes that recover next day", () => {
    // 2:1 split down (price halves and stays low)
    const splitDown: Bar[] = [
      { d: "2026-06-01", close: 100 },
      { d: "2026-06-02", close: 50 },
      { d: "2026-06-03", close: 51 },
    ];
    const splitDownSuspects = splitSuspects(splitDown);
    expect(splitDownSuspects).toHaveLength(1);
    expect(splitDownSuspects[0]).toEqual({
      date: "2026-06-02",
      ratio: 0.5,
      factor: 2,
    });

    // 1:2 reverse split up (price doubles and stays high)
    const splitUp: Bar[] = [
      { d: "2026-06-01", close: 10 },
      { d: "2026-06-02", close: 20 },
      { d: "2026-06-03", close: 21 },
    ];
    const splitUpSuspects = splitSuspects(splitUp);
    expect(splitUpSuspects).toHaveLength(1);
    expect(splitUpSuspects[0]).toEqual({
      date: "2026-06-02",
      ratio: 2.0,
      factor: 0.5,
    });

    // Transient spike (halves then immediately recovers next day)
    const transientSpike: Bar[] = [
      { d: "2026-06-01", close: 100 },
      { d: "2026-06-02", close: 50 },
      { d: "2026-06-03", close: 100 },
    ];
    expect(splitSuspects(transientSpike)).toEqual([]);
  });

  it("detects flat runs of identical closes", () => {
    const bars: Bar[] = [
      { d: "2026-06-01", close: 10 },
      { d: "2026-06-02", close: 10 },
      { d: "2026-06-03", close: 10 },
      { d: "2026-06-04", close: 10 },
      { d: "2026-06-05", close: 12 },
      { d: "2026-06-06", close: 12 },
      { d: "2026-06-07", close: 12 },
    ];

    // Find flat run of length >= 4
    const runs4 = flatRuns(bars, 4);
    expect(runs4).toHaveLength(1);
    expect(runs4[0]).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      length: 4,
      close: 10,
    });

    // Find flat run of length >= 3 (should return both runs)
    const runs3 = flatRuns(bars, 3);
    expect(runs3).toHaveLength(2);
    expect(runs3[0]).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      length: 4,
      close: 10,
    });
    expect(runs3[1]).toEqual({
      startDate: "2026-06-05",
      endDate: "2026-06-07",
      length: 3,
      close: 12,
    });
  });

  it("detects calendar gaps beyond maxGapDays", () => {
    const bars: Bar[] = [
      { d: "2026-06-01", close: 100 },
      { d: "2026-06-02", close: 101 },
      // 14 calendar days gap
      { d: "2026-06-16", close: 102 },
      { d: "2026-06-17", close: 103 },
    ];

    const gapFindings = gaps(bars, 10);
    expect(gapFindings).toHaveLength(1);
    expect(gapFindings[0]).toEqual({
      startDate: "2026-06-02",
      endDate: "2026-06-16",
      gapDays: 14,
    });
  });
});

describe("runIntegrityJob", () => {
  it("runs the full integrity check job on mock database records", async () => {
    const db = migratedDb();
    insertPrices(db, [
      { symbol: "MU", d: "2026-06-01", close: 100 },
      { symbol: "MU", d: "2026-06-02", close: 101 },
      { symbol: "MU", d: "2026-06-03", close: 102 },
      { symbol: "NVDA", d: "2026-06-01", close: 100 },
      { symbol: "NVDA", d: "2026-06-02", close: 50 },
      { symbol: "NVDA", d: "2026-06-03", close: 51 },
    ]);

    const result = await runIntegrityJob(db, ["MU", "NVDA"]);
    expect(result).toContain("2 symbols");
    expect(result).toContain("1 split-suspects across 1 symbols");
  });
});
