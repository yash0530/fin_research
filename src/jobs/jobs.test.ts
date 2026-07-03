import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { applyMigrations, type SqlDb } from "../db/migrate";
import { countRows, insertPrices } from "../db/queries";
import { runStatsJob } from "./stats";
import { parseNewsRss, googleNewsUrl, urlHash, runNewsJob } from "./news";
import { runEarningsJob } from "./earnings";
import { overnightSteps, runOvernight, runDigestJob, runPricesHealJob, type OvernightDeps } from "./overnight";
import { runChain, type JobResult } from "./runner";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const INIT = readFileSync("prisma/migrations/0001_init.sql", "utf8");

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, [{ name: "0001_init", sql: INIT }]);
  return db;
}

// ── stats ─────────────────────────────────────────────────────────────────────

describe("runStatsJob", () => {
  it("updates ticker stat columns from fetched quotes", async () => {
    const db = migratedDb();
    db.prepare('INSERT INTO "Ticker" ("symbol","marketCap") VALUES (?,?)').run("MU", 1);
    const detail = await runStatsJob(db, {
      symbols: ["MU"],
      fetchQuotes: async () => [{ symbol: "MU", marketCap: 1.3e11, forwardPE: 11, beta: 1.3 }],
    });
    const row = db.prepare('SELECT "marketCap","forwardPE","beta","statsUpdatedAt" FROM "Ticker" WHERE "symbol"=?').get("MU") as {
      marketCap: number;
      forwardPE: number;
      beta: number;
      statsUpdatedAt: string | null;
    };
    expect(row.marketCap).toBe(1.3e11);
    expect(row.forwardPE).toBe(11);
    expect(row.statsUpdatedAt).not.toBeNull();
    expect(detail).toMatch(/1\/1 tickers updated/);
  });

  it("COALESCE keeps a prior value when a fresh field is null", async () => {
    const db = migratedDb();
    db.prepare('INSERT INTO "Ticker" ("symbol","marketCap") VALUES (?,?)').run("MU", 999);
    await runStatsJob(db, { symbols: ["MU"], fetchQuotes: async () => [{ symbol: "MU", forwardPE: 11 }] });
    const row = db.prepare('SELECT "marketCap","forwardPE" FROM "Ticker" WHERE "symbol"=?').get("MU") as {
      marketCap: number;
      forwardPE: number;
    };
    expect(row.marketCap).toBe(999); // not wiped
    expect(row.forwardPE).toBe(11);
  });

  it("returns cleanly when the fetch fails (never crashes)", async () => {
    const db = migratedDb();
    const detail = await runStatsJob(db, {
      symbols: ["MU"],
      fetchQuotes: async () => { throw new Error("network down"); },
    });
    expect(detail).toMatch(/fetch failed: network down/);
  });
});

// ── news ────────────────────────────────────────────────────────────────────

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Search</title>
<item><title>Nvidia soars - Reuters</title><link>https://news.google.com/x1</link><pubDate>Mon, 30 Jun 2025 12:00:00 GMT</pubDate><description>&lt;a href="#"&gt;Nvidia soars on AI demand&lt;/a&gt;</description><source url="https://reuters.com">Reuters</source></item>
<item><title>AMD update - CNBC</title><link>https://news.google.com/x2</link><pubDate>Tue, 01 Jul 2025 12:00:00 GMT</pubDate></item>
</channel></rss>`;

describe("news parser", () => {
  it("googleNewsUrl + urlHash are stable", () => {
    expect(googleNewsUrl("HBM DRAM")).toContain("news.google.com/rss/search?q=HBM%20DRAM");
    expect(urlHash("https://a")).toBe(urlHash("https://a"));
    expect(urlHash("https://a")).not.toBe(urlHash("https://b"));
  });

  it("parses items, strips HTML from snippet, tags sector/symbol", () => {
    const rows = parseNewsRss(RSS, { sectorCode: "ai_compute_gpu", symbol: "NVDA" });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      url: "https://news.google.com/x1",
      title: "Nvidia soars - Reuters",
      snippet: "Nvidia soars on AI demand",
      source: "Reuters",
      sectorCode: "ai_compute_gpu",
      symbol: "NVDA",
    });
    expect(rows[0].publishedAt).toMatch(/2025-06-30/);
  });

  it("returns [] on malformed XML", () => {
    expect(parseNewsRss("not xml <<<")).toEqual([]);
  });
});

describe("runNewsJob", () => {
  it("inserts new items and dedupes on re-run", async () => {
    const db = migratedDb();
    const deps = { queries: [{ q: "AI GPU", sectorCode: "ai_compute_gpu" }], fetchRss: async () => RSS };
    const first = await runNewsJob(db, deps);
    expect(first).toMatch(/2 new items/);
    expect(countRows(db, "NewsItem")).toBe(2);
    const second = await runNewsJob(db, deps);
    expect(second).toMatch(/0 new items/); // urlHash dedupe
    expect(countRows(db, "NewsItem")).toBe(2);
  });

  it("a failing query does not abort the rest", async () => {
    const db = migratedDb();
    let call = 0;
    const detail = await runNewsJob(db, {
      queries: [{ q: "a" }, { q: "b" }],
      fetchRss: async () => {
        call++;
        if (call === 1) throw new Error("rss 429");
        return RSS;
      },
    });
    expect(detail).toMatch(/1 query errors/);
    expect(countRows(db, "NewsItem")).toBe(2); // second query still landed
  });
});

// ── earnings ──────────────────────────────────────────────────────────────────

describe("runEarningsJob", () => {
  it("upserts earnings catalysts and dedupes on re-run", async () => {
    const db = migratedDb();
    const deps = {
      symbols: ["MU", "NVDA"],
      fetchEarnings: async (s: string) => [{ symbol: s, d: "2026-09-25" }],
    };
    const first = await runEarningsJob(db, deps);
    expect(first).toMatch(/2 new catalysts/);
    expect(countRows(db, "Catalyst")).toBe(2);
    await runEarningsJob(db, deps);
    expect(countRows(db, "Catalyst")).toBe(2); // (kind,symbol,d) dedupe
  });

  it("a per-symbol failure is caught", async () => {
    const db = migratedDb();
    const detail = await runEarningsJob(db, {
      symbols: ["MU", "BOOM"],
      fetchEarnings: async (s) => {
        if (s === "BOOM") throw new Error("cal fail");
        return [{ symbol: s, d: "2026-09-25" }];
      },
    });
    expect(detail).toMatch(/1 errors/);
    expect(countRows(db, "Catalyst")).toBe(1);
  });
});

// ── overnight ───────────────────────────────────────────────────────────────

const fakeDeps = (log: string[], failNews = false): OvernightDeps => ({
  pricesHeal: async () => { log.push("prices-heal"); return "healed"; },
  stats: async () => { log.push("stats"); return "stats ok"; },
  news: async () => { log.push("news"); if (failNews) throw new Error("rss 429"); return "news ok"; },
  earnings: async () => { log.push("earnings"); return "earnings ok"; },
  rules: async () => { log.push("rules"); return "rules ok"; },
  digest: async () => { log.push("digest"); return "digest ok"; },
});

describe("overnight chain", () => {
  it("runs steps in the canonical order", async () => {
    const log: string[] = [];
    await runChain(overnightSteps(fakeDeps(log)));
    expect(log).toEqual(["prices-heal", "stats", "news", "earnings", "rules", "digest"]);
  });

  it("a failed step is recorded but never aborts the chain", async () => {
    const log: string[] = [];
    const recorded: JobResult[] = [];
    const summary = await runChain(overnightSteps(fakeDeps(log, true)), (r) => recorded.push(r));
    expect(log).toEqual(["prices-heal", "stats", "news", "earnings", "rules", "digest"]); // digest still ran
    expect(summary).toMatchObject({ ok: 5, failed: 1 });
    expect(recorded.find((r) => r.job === "news")).toMatchObject({ ok: false });
  });

  it("runOvernight writes one JobRun row per step", async () => {
    const db = migratedDb();
    const log: string[] = [];
    const summary = await runOvernight(db, fakeDeps(log, true));
    expect(countRows(db, "JobRun")).toBe(6);
    expect(summary.failed).toBe(1);
    const failed = db.prepare('SELECT "job" FROM "JobRun" WHERE "ok"=0').get() as { job: string };
    expect(failed.job).toBe("news");
  });
});

describe("runPricesHealJob", () => {
  it("tops up bars (conc/​stagger) and never throws", async () => {
    const db = migratedDb();
    const detail = await runPricesHealJob(db, {
      symbols: ["MU", "BOOM", "NVDA"],
      concurrency: 6,
      staggerMs: 0,
      sleep: async () => {},
      fetchBars: async (symbol) => {
        if (symbol === "BOOM") throw new Error("429");
        return [{ symbol, d: "2026-07-01", close: 100, volume: null, source: "yahoo2" }];
      },
    });
    expect(detail).toMatch(/2\/3 symbols, 2 bars, 1 errors/);
    expect(countRows(db, "Price")).toBe(2);
  });
});

describe("runDigestJob", () => {
  it("synthesizes from stored facts and persists a digest", async () => {
    const db = migratedDb();
    // an upcoming catalyst so the catalyst family surfaces something
    db.prepare('INSERT INTO "Catalyst" ("d","kind","symbol","title") VALUES (?,?,?,?)').run(
      "2026-07-03",
      "earnings",
      "MU",
      "MU earnings",
    );
    insertPrices(db, [{ symbol: "MU", d: "2026-07-01", close: 100 }]);
    const detail = await runDigestJob(db, { asOf: "2026-07-02" });
    expect(detail).toMatch(/digest 2026-07-02/);
    expect(countRows(db, "Digest")).toBe(1);
  });

  // Regression: reproduce the live shape that silenced the catalysts family — a
  // cluster of `earnings` catalysts ~12 days out (nearest was ASML at +12d) with
  // asOf just before. The old 7-day digest window fell short of the cluster, so the
  // family emitted nothing despite 126 rows in the book. The 14-day window fixes it.
  it("surfaces the near-term earnings cluster the old 7-day window missed", async () => {
    const db = migratedDb();
    const asOf = "2026-07-02";
    const earnings = [
      { d: "2026-07-14", symbol: "ASML" }, // +12d — inside 14d, was outside 7d
      { d: "2026-07-16", symbol: "TSM" }, // +14d — the window edge
      { d: "2026-08-01", symbol: "MU" }, // +30d — still too far out
    ];
    for (const e of earnings) {
      db.prepare('INSERT INTO "Catalyst" ("d","kind","symbol","title") VALUES (?,?,?,?)').run(
        e.d,
        "earnings",
        e.symbol,
        `${e.symbol} earnings`,
      );
    }
    await runDigestJob(db, { asOf });
    const row = db.prepare('SELECT "dataJson" FROM "Digest" WHERE "d"=?').get(asOf) as { dataJson: string };
    const digest = JSON.parse(row.dataJson) as { insights: { family: string; text: string }[] };
    const cats = digest.insights.filter((i) => i.family === "catalysts");
    const syms = cats.map((c) => c.text);
    expect(cats.length).toBeGreaterThan(0); // was 0 under the 7-day window
    expect(syms.some((t) => t.includes("ASML"))).toBe(true);
    expect(syms.some((t) => t.includes("TSM"))).toBe(true);
    expect(syms.some((t) => t.includes("MU"))).toBe(false); // +30d stays out
  });
});
