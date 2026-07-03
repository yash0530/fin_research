import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { applyMigrations, type SqlDb } from "../db/migrate";
import { insertPrices, insertSectors, upsertTicker, linkTickerSector } from "../db/queries";
import { buildMarketInputs } from "./market-inputs";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const INIT = readFileSync("prisma/migrations/0001_init.sql", "utf8");

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, [{ name: "0001_init", sql: INIT }]);
  return db;
}

const MAX_DATE = "2026-07-02";

/** N consecutive calendar dates ending at `end` (used as the trading-date grid). */
function dateGrid(n: number, end = MAX_DATE): string[] {
  const endT = new Date(`${end}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) =>
    new Date(endT - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

/** 59 flat closes at `base`, then a final close moved `lastPct` — so the symbol's
 *  1-day % AND 30-day % both equal `lastPct`, and its 50-dma ≈ base (clean to reason about). */
function flatThenMove(base: number, lastPct: number, dates: string[]): number[] {
  const last = base * (1 + lastPct / 100);
  return dates.map((_, i) => (i === dates.length - 1 ? last : base));
}

function seedSymbol(
  db: SqlDb,
  symbol: string,
  closes: number[],
  dates: string[],
): void {
  upsertTicker(db, { symbol });
  insertPrices(
    db,
    closes.map((close, i) => ({ symbol, d: dates[i], close })),
  );
}

/** A fully-seeded book: 3 sectors, a hyperscaler basket, HYG/IEF, a sub-$2 name,
 *  and two stragglers (one old-bar, one no-bar) — enough to exercise every family. */
function seedMarket(db: SqlDb): void {
  insertSectors(db, [
    { code: "g_info_tech", name: "Information Technology", taxonomy: "gics", driver: 0 },
    { code: "ai_memory", name: "Memory", taxonomy: "ai_infra", driver: 2 },
    { code: "ai_compute_gpu", name: "Compute / GPU", taxonomy: "ai_infra", driver: 1 },
  ]);

  const g = dateGrid(60); // 60 sessions ending MAX_DATE

  // GICS members: one clear advancer above its MA, one decliner below.
  seedSymbol(db, "UP1", flatThenMove(100, 20, g), g);
  seedSymbol(db, "DN1", flatThenMove(100, -20, g), g);
  linkTickerSector(db, "UP1", "g_info_tech");
  linkTickerSector(db, "DN1", "g_info_tech");

  // ai_memory lags (−5% 30d) → diverges from a +10% basket by −15pp.
  seedSymbol(db, "MEM1", flatThenMove(100, -5, g), g);
  seedSymbol(db, "MEM2", flatThenMove(100, -5, g), g);
  linkTickerSector(db, "MEM1", "ai_memory");
  linkTickerSector(db, "MEM2", "ai_memory");

  // ai_compute rips (+40% 30d) → diverges by +30pp AND is the top |1-day| mover.
  seedSymbol(db, "CMP1", flatThenMove(100, 40, g), g);
  linkTickerSector(db, "CMP1", "ai_compute_gpu");

  // Hyperscaler basket, +10% each → basket 30d = +10%.
  for (const s of ["MSFT", "GOOGL", "AMZN", "META"]) seedSymbol(db, s, flatThenMove(100, 10, g), g);

  // Credit pair: HYG down −8% vs a flat IEF → ratio change ≈ −8% (financing stress).
  seedSymbol(db, "HYG", flatThenMove(100, -8, g), g);
  seedSymbol(db, "IEF", flatThenMove(100, 0, g), g);

  // Sub-$2 junk: a huge % move that must NOT reach the movers list.
  seedSymbol(db, "PENNY", flatThenMove(1, 50, g), g);

  // Stragglers: OLD1's last bar lags by 10 sessions; NOBAR is active with no prices.
  const old = dateGrid(50, g[g.length - 11]); // ends 10 sessions before MAX_DATE
  seedSymbol(db, "OLD1", flatThenMove(100, 0, old), old);
  upsertTicker(db, { symbol: "NOBAR" });
}

describe("buildMarketInputs", () => {
  it("never throws and derives nothing on an empty book", () => {
    const db = migratedDb();
    const out = buildMarketInputs(db, "2026-07-03");
    expect(out).toEqual({});
  });

  it("derives breadth from fresh names only (advancers/decliners + % above 50-dma)", () => {
    const db = migratedDb();
    seedMarket(db);
    const { breadth } = buildMarketInputs(db, "2026-07-03");
    expect(breadth).toBeDefined();
    expect(breadth!.pctAbove50dma).toBeGreaterThan(0);
    expect(breadth!.pctAbove50dma).toBeLessThanOrEqual(100);
    expect(breadth!.advancers).toBeGreaterThanOrEqual(1); // UP1, CMP1, basket
    expect(breadth!.decliners).toBeGreaterThanOrEqual(1); // DN1, MEM1/2, HYG
  });

  it("ranks movers by |1-day %|, excludes sub-$2 junk and the HYG/IEF benchmarks", () => {
    const db = migratedDb();
    seedMarket(db);
    const { movers } = buildMarketInputs(db, "2026-07-03");
    expect(movers).toBeDefined();
    expect(movers!.length).toBeLessThanOrEqual(8);
    expect(movers![0].symbol).toBe("CMP1"); // +40% is the largest |move|
    const syms = movers!.map((m) => m.symbol);
    expect(syms).not.toContain("PENNY"); // < $2
    expect(syms).not.toContain("HYG");
    expect(syms).not.toContain("IEF");
  });

  it("splits sector pulses by taxonomy (median 1-day %)", () => {
    const db = migratedDb();
    seedMarket(db);
    const { gicsPulse, aiPulse } = buildMarketInputs(db, "2026-07-03");
    expect(gicsPulse?.map((p) => p.sectorCode)).toContain("g_info_tech");
    const aiCodes = aiPulse?.map((p) => p.sectorCode) ?? [];
    expect(aiCodes).toEqual(expect.arrayContaining(["ai_memory", "ai_compute_gpu"]));
    const mem = aiPulse!.find((p) => p.sectorCode === "ai_memory");
    expect(mem!.retPct).toBeCloseTo(-5, 5); // both members −5%
  });

  it("computes ai_* divergences against the hyperscaler basket", () => {
    const db = migratedDb();
    seedMarket(db);
    const { divergences } = buildMarketInputs(db, "2026-07-03");
    expect(divergences).toBeDefined();
    const mem = divergences!.find((d) => d.sectorCode === "ai_memory");
    expect(mem!.hyperscalerRetPct).toBeCloseTo(10, 5);
    expect(mem!.sectorRetPct).toBeCloseTo(-5, 5); // gap = −15pp → synthesize warns
    const cmp = divergences!.find((d) => d.sectorCode === "ai_compute_gpu");
    expect(cmp!.sectorRetPct).toBeCloseTo(40, 5); // gap = +30pp → synthesize critical
  });

  it("computes the HYG/IEF credit-ratio change over ~30 sessions", () => {
    const db = migratedDb();
    seedMarket(db);
    const { credit } = buildMarketInputs(db, "2026-07-03");
    expect(credit).toBeDefined();
    expect(credit!.ratioChangePct).toBeCloseTo(-8, 5);
    expect(credit!.lookbackDays).toBe(30);
  });

  it("reports data health: age since the book, plus stale/absent stragglers", () => {
    const db = migratedDb();
    seedMarket(db);
    const { dataHealth } = buildMarketInputs(db, "2026-07-03");
    expect(dataHealth).toBeDefined();
    expect(dataHealth!.ageDays).toBe(1); // 2026-07-03 − 2026-07-02
    expect(dataHealth!.stalePriceCount).toBe(2); // OLD1 (lags 10 sessions) + NOBAR (no prices)
  });

  it("omits credit when the HYG/IEF pair is absent (missing data → omission, not a throw)", () => {
    const db = migratedDb();
    seedMarket(db);
    // A DB with prices but no benchmarks still yields breadth but no credit.
    const db2 = migratedDb();
    insertSectors(db2, [{ code: "g_info_tech", name: "IT", taxonomy: "gics", driver: 0 }]);
    const g = dateGrid(60);
    seedSymbol(db2, "AAA", flatThenMove(100, 3, g), g);
    linkTickerSector(db2, "AAA", "g_info_tech");
    const out = buildMarketInputs(db2, "2026-07-03");
    expect(out.credit).toBeUndefined();
    expect(out.breadth).toBeDefined();
    // sanity: the fully-seeded book DID produce credit
    expect(buildMarketInputs(db, "2026-07-03").credit).toBeDefined();
  });
});
