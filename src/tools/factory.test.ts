import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { applyMigrations, type SqlDb } from "../db/migrate";
import {
  insertPrices,
  insertFundamentals,
  insertNewsItems,
  upsertCatalyst,
  upsertTicker,
  upsertTickerStats,
  linkTickerSector,
  insertSectors,
  type PriceRow,
} from "../db/queries";
import { execute } from "./types";
import { buildProductionRegistry, type LiveFetchers } from "./factory";
import type { QuoteStat } from "../net/yahoo2";
import { accrualRatio, altmanZ, piotroskiF, beneishM, type AnnualPeriod } from "./qoe";

// node:sqlite via createRequire (vite-safe), matching the repo's other DB tests.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

const ALL_MIGRATIONS = readdirSync("prisma/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((name) => ({ name: name.replace(/\.sql$/, ""), sql: readFileSync(join("prisma/migrations", name), "utf8") }));

// ── fixtures ─────────────────────────────────────────────────────────────────

function isoDay(base: number, i: number): string {
  return new Date(base + i * 86_400_000).toISOString().slice(0, 10);
}

function priceSeries(symbol: string, start: number, n: number, startPrice: number, step: number): PriceRow[] {
  const base = Date.parse("2024-01-01T00:00:00Z");
  const rows: PriceRow[] = [];
  for (let i = 0; i < n; i++) rows.push({ symbol, d: isoDay(base, start + i), close: startPrice + i * step, volume: 1_000_000 });
  return rows;
}

function seed(db: SqlDb): void {
  applyMigrations(db, ALL_MIGRATIONS);

  insertSectors(db, [{ code: "ai_memory", name: "Memory", taxonomy: "ai_infra", driver: 2 }]);

  // Subject + peer cohort in ai_memory.
  const cohort: { s: string; fwd: number; rg: number; pm: number; yc: number }[] = [
    { s: "MU", fwd: 11, rg: 0.58, pm: 0.22, yc: 45 },
    { s: "SNDK", fwd: 14, rg: 0.3, pm: 0.1, yc: 20 },
    { s: "WDC", fwd: 9, rg: 0.12, pm: 0.08, yc: -5 },
    { s: "STX", fwd: 13, rg: 0.18, pm: 0.11, yc: 12 },
  ];
  for (const c of cohort) {
    upsertTicker(db, { symbol: c.s, name: c.s, forwardPE: c.fwd, marketCap: 1e11 });
    linkTickerSector(db, c.s, "ai_memory");
    upsertTickerStats(db, { symbol: c.s, revenueGrowth: c.rg, profitMargin: c.pm, yearChange: c.yc });
  }

  // 210 daily closes for MU (uptrend) → technicals/price_history "ok".
  insertPrices(db, priceSeries("MU", 0, 210, 60, 0.2));

  // Benchmarks for macro (latest close is what the tool reads).
  insertPrices(db, priceSeries("^VIX", 0, 5, 15, 0.5));
  insertPrices(db, priceSeries("^TNX", 0, 5, 4, 0));
  insertPrices(db, priceSeries("^IRX", 0, 5, 5, 0));
  insertPrices(db, priceSeries("HYG", 0, 5, 80, 0));
  insertPrices(db, priceSeries("IEF", 0, 5, 95, 0));

  // 6 quarters of fundamentals → financial_trends YoY + dcf trailing FCF.
  insertFundamentals(
    db,
    Array.from({ length: 6 }, (_, i) => ({
      symbol: "MU",
      periodEnd: `2024-0${i + 1}-01`.slice(0, 10),
      revenue: 5000 + i * 500,
      grossProfit: 2000 + i * 250,
      operatingIncome: 1200 + i * 150,
      netIncome: 900 + i * 120,
      fcf: 700 + i * 80,
      capex: 400,
      totalAssets: 40000,
      totalDebt: 12000,
      cash: 5000,
      equity: 20000,
      sharesOut: 1100,
    })),
  );

  insertNewsItems(db, [
    { urlHash: "h1", url: "https://x/1", title: "MU lands HBM deal", source: "wire", symbol: "MU", publishedAt: "2026-06-01T00:00:00Z" },
    { urlHash: "h2", url: "https://x/2", title: "Memory prices rise", source: "wire", symbol: "MU", publishedAt: "2026-06-02T00:00:00Z" },
  ]);

  upsertCatalyst(db, { d: "2026-07-10", kind: "earnings", symbol: "MU", title: "MU Q3 earnings" });
}

function newDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  seed(db);
  return db;
}

// ── local tools ────────────────────────────────────────────────────────────

describe("buildProductionRegistry — local tools over a temp migrated DB", () => {
  it("registers the full tool catalog", () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU", sectorCode: "ai_memory" });
    for (const name of [
      "price_history", "technicals", "fundamentals", "financial_trends", "qoe", "dcf",
      "relative_rank", "sector_heat", "peer_compare", "catalysts", "news_tape", "macro",
      "quote_snapshot", "movers", "sentiment", "insider_form4", "institutional", "options_metrics",
    ]) {
      expect(reg.has(name)).toBe(true);
    }
  });

  it("price_history returns despiked closes + sources", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU" });
    const r = await execute(reg.get("price_history")!, {});
    expect(r.error).toBeUndefined();
    expect(r.data.points).toBe(210);
    expect(r.data.data_status).toBe("ok");
    expect(r.data.latestClose).toBeCloseTo(60 + 209 * 0.2);
    expect(r.sources.length).toBeGreaterThan(0);
    expect(r.confidence).toBe("high");
  });

  it("technicals computes indicators over local closes", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU" });
    const r = await execute(reg.get("technicals")!, {});
    expect(r.data.sma50).not.toBeNull();
    expect(r.data.sma200).not.toBeNull();
    expect(r.data.rsi14).not.toBeNull();
    expect(r.data.maCross).toBe("bull");
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it("fundamentals surfaces current price + latest quarter", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU" });
    const r = await execute(reg.get("fundamentals")!, {});
    expect(r.data.current_price).toBeCloseTo(60 + 209 * 0.2);
    expect(r.data.revenue).toBe(7500);
    expect(r.data.data_status).toBe("ok");
  });

  it("financial_trends computes YoY over 6 quarters", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU" });
    const r = await execute(reg.get("financial_trends")!, {});
    expect(r.data.quarters).toBe(6);
    expect(r.data.revenueYoYPct).not.toBeNull();
    expect(r.data.data_status).toBe("ok");
  });

  it("qoe honestly reports partial (canonical inputs absent or incomplete)", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU" });
    const r = await execute(reg.get("qoe")!, {});
    expect(r.data.data_status).toBe("partial");
    expect(r.data.accrualRatio).not.toBeNull();
    expect(r.confidence).toBe("low");
  });

  it("qoe returns canonical scores when 8 consecutive quarters of deep data are present", async () => {
    const db = new DatabaseSync(":memory:") as unknown as SqlDb;
    applyMigrations(db, ALL_MIGRATIONS);

    const t: AnnualPeriod = {
      revenue: 1000, grossProfit: 400, sga: 200, depreciation: 50, ebit: 150, netIncome: 100,
      receivables: 100, currentAssets: 500, ppe: 300, totalAssets: 1000, currentLiabilities: 200,
      longTermDebt: 100, totalLiabilities: 400, retainedEarnings: 250, sharesOut: 100, cfo: 120,
      workingCapital: 300, sbc: 30, marketValueEquity: 1500,
    };
    const p: AnnualPeriod = {
      revenue: 900, grossProfit: 360, sga: 180, depreciation: 45, ebit: 130, netIncome: 80,
      receivables: 80, currentAssets: 450, ppe: 280, totalAssets: 950, currentLiabilities: 210,
      longTermDebt: 120, totalLiabilities: 420, retainedEarnings: 180, sharesOut: 100, cfo: 95,
      workingCapital: 240, sbc: 25,
    };

    const dates = [
      "2023-03-31",
      "2023-06-30",
      "2023-09-30",
      "2023-12-31",
      "2024-03-31",
      "2024-06-30",
      "2024-09-30",
      "2024-12-31",
    ];

    const tQuarters = Array.from({ length: 8 }, (_, i) => {
      const isCurrent = i >= 4;
      const base = isCurrent ? t : p;
      return {
        symbol: "MU",
        periodEnd: dates[i],
        revenue: base.revenue / 4,
        grossProfit: base.grossProfit / 4,
        sga: base.sga / 4,
        depreciation: base.depreciation / 4,
        operatingIncome: base.ebit / 4,
        netIncome: base.netIncome / 4,
        cfo: base.cfo / 4,
        receivables: base.receivables,
        currentAssets: base.currentAssets,
        ppe: base.ppe,
        totalAssets: base.totalAssets,
        currentLiabilities: base.currentLiabilities,
        totalDebt: base.longTermDebt,
        equity: base.totalAssets - base.totalLiabilities,
        retainedEarnings: base.retainedEarnings,
        sharesOut: base.sharesOut,
      };
    });
    insertFundamentals(db, tQuarters);

    const reg = buildProductionRegistry(db, { symbol: "MU" });
    const r = await execute(reg.get("qoe")!, {});
    expect(r.data.data_status).toBe("ok");
    expect(r.confidence).toBe("high");
    expect(r.data.accrualRatio).toBeCloseTo(accrualRatio(t), 4);
    
    const tWithoutMVE = { ...t };
    delete tWithoutMVE.marketValueEquity;
    expect(r.data.altmanZ).toBeCloseTo(altmanZ(tWithoutMVE), 3);
    
    expect(r.data.piotroskiF).toBe(piotroskiF(t, p));
    expect(r.data.beneishM).toBeCloseTo(beneishM(t, p), 3);
  });

  it("dcf computes a fair-value range from local FCF", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU" });
    const r = await execute(reg.get("dcf")!, {});
    const range = r.data.fairValueRange as { low: number; mid: number; high: number };
    expect(range.high).toBeGreaterThan(range.low);
    expect(r.data.data_status).toBe("ok");
  });

  it("relative_rank places MU in the universe", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU" });
    const r = await execute(reg.get("relative_rank")!, {});
    expect(r.data.percentile).toBe(100); // MU has the highest yearChange
    expect(r.data.universeSize).toBe(4);
  });

  it("sector_heat aggregates the ai_memory cohort", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU", sectorCode: "ai_memory" });
    const r = await execute(reg.get("sector_heat")!, {});
    const heat = r.data.heat as Array<{ sectorCode: string; count: number }>;
    expect(heat[0].sectorCode).toBe("ai_memory");
    expect(heat[0].count).toBe(4);
  });

  it("peer_compare ranks MU within its cohort", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU" });
    const r = await execute(reg.get("peer_compare")!, {});
    expect(r.data.cohortSize).toBe(4);
    const pct = r.data.percentiles as { revenueGrowthPct: number | null };
    expect(pct.revenueGrowthPct).toBe(100); // MU's 0.58 is the highest growth
  });

  it("catalysts windows upcoming events", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU", asOf: "2026-07-02" });
    const r = await execute(reg.get("catalysts")!, {});
    expect(r.data.count).toBe(1);
    expect(r.data.data_status).toBe("ok");
  });

  it("news_tape returns deduped local news", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU" });
    const r = await execute(reg.get("news_tape")!, {});
    expect(r.data.count).toBe(2);
  });

  it("macro classifies the regime from benchmark closes", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU" });
    const r = await execute(reg.get("macro")!, {});
    expect(["risk_on", "neutral", "risk_off"]).toContain(r.data.regime);
    expect((r.data.inputsPresent as string[]).length).toBeGreaterThanOrEqual(3);
  });

  it("gracefully reports missing when the symbol has no local data", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "NOPE" });
    const r = await execute(reg.get("price_history")!, {});
    expect(r.data.data_status).toBe("missing");
    expect(r.sources.length).toBeGreaterThan(0); // never a silent empty
    expect(r.confidence).toBe("low");
  });
});

// ── live tools ───────────────────────────────────────────────────────────────

describe("buildProductionRegistry — live tools", () => {
  const quote: QuoteStat = {
    symbol: "MU", price: 102, marketCap: 1.1e11, forwardPE: 11, trailingPE: 13,
    profitMargin: 0.22, revenueGrowth: 0.58, fiftyTwoWeekHigh: 120, fiftyTwoWeekLow: 60,
    beta: 1.3, eps: 8, yearChange: 45, source: "yahoo2",
  };
  const live: LiveFetchers = { quotes: async () => [quote] };

  it("quote_snapshot uses the injected fetcher", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU", live });
    const r = await execute(reg.get("quote_snapshot")!, {});
    expect(r.data.price).toBe(102);
    expect(r.data.data_status).toBe("ok");
    expect(r.confidence).toBe("high");
  });

  it("degrades to low-confidence missing when a live fetcher is not configured", async () => {
    const reg = buildProductionRegistry(newDb(), { symbol: "MU" });
    const r = await execute(reg.get("institutional")!, {});
    expect(r.data.data_status).toBe("missing");
    expect(r.confidence).toBe("low");
    expect(r.sources.length).toBeGreaterThan(0);
    expect(r.error).toBeUndefined(); // graceful — not a thrown tool error
  });

  it("degrades gracefully when a live fetcher throws", async () => {
    const boom: LiveFetchers = { quotes: async () => { throw new Error("network down"); } };
    const reg = buildProductionRegistry(newDb(), { symbol: "MU", live: boom });
    const r = await execute(reg.get("quote_snapshot")!, {});
    expect(r.data.data_status).toBe("missing");
    expect(String(r.data.note)).toMatch(/network down/);
  });
});
