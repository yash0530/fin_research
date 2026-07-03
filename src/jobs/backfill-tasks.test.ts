import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { applyMigrations, type SqlDb } from "../db/migrate";
import { countRows, backfillIsDone } from "../db/queries";
import {
  backfillPrices10y,
  backfillFundamentals,
  backfillEdgarIndex,
  parseCompanyTickers,
  runBackfillPool,
} from "./backfill";
import type { DailyBar } from "../net/yahoo2";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const INIT = readFileSync("prisma/migrations/0001_init.sql", "utf8");

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, [{ name: "0001_init", sql: INIT }]);
  return db;
}

const noSleep = async (): Promise<void> => {};
const bars = (symbol: string, n: number): DailyBar[] =>
  Array.from({ length: n }, (_, i) => ({
    symbol,
    d: `2024-01-${String(i + 1).padStart(2, "0")}`,
    close: 100 + i,
    volume: null,
    source: "yahoo2",
  }));

describe("runBackfillPool", () => {
  it("is resumable + catch-per-item under concurrency", async () => {
    const fetched: string[] = [];
    const summary = await runBackfillPool<number>({
      symbols: ["AAA", "BBB", "CCC", "DDD"],
      concurrency: 2,
      staggerMs: 0,
      sleep: noSleep,
      isDone: (s) => s === "AAA",
      fetchOne: async (s) => {
        fetched.push(s);
        if (s === "CCC") throw new Error("timeout");
        return [1, 2];
      },
      write: () => {},
      markDone: () => {},
      markError: () => {},
    });
    expect(fetched).not.toContain("AAA"); // done → skipped, never fetched
    expect(summary).toMatchObject({ done: 2, errors: 1, skipped: 1, rows: 4 });
  });
});

describe("backfillPrices10y (mocked fetcher, real DB)", () => {
  it("writes bars, records progress, and is resumable", async () => {
    const db = migratedDb();
    const s1 = await backfillPrices10y(db, {
      symbols: ["MU", "NVDA"],
      fetchBars: async (symbol) => bars(symbol, 3),
      staggerMs: 0,
      sleep: noSleep,
    });
    expect(s1).toMatchObject({ done: 2, errors: 0, skipped: 0, rows: 6 });
    expect(countRows(db, "Price")).toBe(6);
    expect(backfillIsDone(db, "prices10y", "MU")).toBe(true);

    // Re-run: both symbols are done → skipped, no re-fetch.
    let refetched = 0;
    const s2 = await backfillPrices10y(db, {
      symbols: ["MU", "NVDA"],
      fetchBars: async (symbol) => {
        refetched++;
        return bars(symbol, 3);
      },
      staggerMs: 0,
      sleep: noSleep,
    });
    expect(s2.skipped).toBe(2);
    expect(refetched).toBe(0);
  });

  it("overwrites existing rows and ignores isDone when force is true", async () => {
    const db = migratedDb();
    // 1. Initial write of MU
    await backfillPrices10y(db, {
      symbols: ["MU"],
      fetchBars: async (symbol) => [{ symbol, d: "2024-01-01", close: 100, volume: 100, source: "yahoo2" }],
      staggerMs: 0,
      sleep: noSleep,
    });
    expect(countRows(db, "Price")).toBe(1);
    const p1 = db.prepare("SELECT close, volume FROM \"Price\" WHERE symbol='MU'").get() as { close: number; volume: number };
    expect(p1.close).toBe(100);

    // 2. Force rewrite MU with a different value
    const s2 = await backfillPrices10y(db, {
      symbols: ["MU"],
      fetchBars: async (symbol) => [{ symbol, d: "2024-01-01", close: 150, volume: 200, source: "yahoo2" }],
      staggerMs: 0,
      sleep: noSleep,
      force: true,
    });
    expect(s2).toMatchObject({ done: 1, errors: 0, skipped: 0, rows: 1 });
    expect(countRows(db, "Price")).toBe(1);
    const p2 = db.prepare("SELECT close, volume FROM \"Price\" WHERE symbol='MU'").get() as { close: number; volume: number };
    expect(p2.close).toBe(150);
    expect(p2.volume).toBe(200);
  });

  it("records a per-symbol error without aborting the rest", async () => {
    const db = migratedDb();
    const summary = await backfillPrices10y(db, {
      symbols: ["MU", "BOOM", "NVDA"],
      fetchBars: async (symbol) => {
        if (symbol === "BOOM") throw new Error("429");
        return bars(symbol, 2);
      },
      staggerMs: 0,
      sleep: noSleep,
    });
    expect(summary).toMatchObject({ done: 2, errors: 1, rows: 4 });
    expect(backfillIsDone(db, "prices10y", "BOOM")).toBe(false);
  });

  it("passes a period1 ≈ today−lookbackDays to the fetcher", async () => {
    const db = migratedDb();
    let seen: Date | null = null;
    await backfillPrices10y(db, {
      symbols: ["MU"],
      lookbackDays: 3660,
      now: () => Date.parse("2026-07-02T00:00:00Z"),
      fetchBars: async (_s, period1) => {
        seen = period1;
        return [];
      },
      staggerMs: 0,
      sleep: noSleep,
    });
    expect(seen!.toISOString().slice(0, 10)).toBe("2016-06-24"); // 3660 days before 2026-07-02
  });
});

describe("backfillFundamentals (mocked fetcher, real DB)", () => {
  it("writes quarterly fundamentals rows", async () => {
    const db = migratedDb();
    const summary = await backfillFundamentals(db, {
      symbols: ["MU"],
      fetchFundamentals: async (symbol) => [
        { symbol, periodEnd: "2024-05-31", revenue: 6800 },
        { symbol, periodEnd: "2024-08-31", revenue: 7000, grossProfit: 2000 },
      ],
      staggerMs: 0,
      sleep: noSleep,
    });
    expect(summary).toMatchObject({ done: 1, rows: 2 });
    expect(countRows(db, "FundamentalsQuarter")).toBe(2);
  });
});

describe("parseCompanyTickers", () => {
  it("maps SYMBOL → 10-digit padded CIK", () => {
    const map = parseCompanyTickers({
      "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
      "1": { cik_str: 723125, ticker: "mu", title: "Micron" },
      "2": { ticker: "", cik_str: 1 }, // no ticker → skipped
    });
    expect(map).toEqual({ AAPL: "0000320193", MU: "0000723125" });
  });
});

describe("backfillEdgarIndex (mocked fetcher, real DB)", () => {
  it("sets CIKs, skips symbols without a CIK, and writes filings", async () => {
    const db = migratedDb();
    db.prepare('INSERT INTO "Ticker" ("symbol") VALUES (?)').run("MU");
    db.prepare('INSERT INTO "Ticker" ("symbol") VALUES (?)').run("NVDA");
    const summary = await backfillEdgarIndex(db, {
      symbols: ["MU", "NVDA", "NOCIK"],
      cikMap: { MU: "0000723125", NVDA: "0001045810" },
      fetchFilings: async (cik, symbol) => [
        { accessionNo: `${symbol}-1`, symbol, cik, form: "10-K", filedAt: "2024-02-01", primaryDoc: null },
      ],
      staggerMs: 0,
      sleep: noSleep,
    });
    // NOCIK has no CIK → not counted at all (clean skip, not an error).
    expect(summary).toMatchObject({ done: 2, errors: 0, rows: 2 });
    expect(countRows(db, "EdgarFiling")).toBe(2);
    const mu = db.prepare('SELECT "cik" FROM "Ticker" WHERE "symbol"=?').get("MU") as { cik: string };
    expect(mu.cik).toBe("0000723125");
  });
});
