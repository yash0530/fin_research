#!/usr/bin/env tsx
// Seeds the SQLite DB: applies migrations, inserts the dual-taxonomy sectors
// (GICS 11 + AI-infra 12), a handful of demo tickers with sector links, and a
// sample digest. Run: npm run seed  (uses DATABASE_URL, default data/engine.db).

import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations, type SqlDb } from "../src/db/migrate";
import { insertSectors, upsertTicker, linkTickerSector, saveDigest, countRows } from "../src/db/queries";
import { GICS_SEEDS, AI_INFRA_SEEDS } from "../src/config/sectors";
import { synthesize } from "../src/research/synthesize";

function databaseFile(): string {
  let url = process.env.DATABASE_URL;
  if (!url && existsSync(".env")) {
    const line = readFileSync(".env", "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
    if (line) url = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  }
  return (url ?? "file:./data/engine.db").replace(/^file:/, "");
}

function loadMigrations(): { name: string; sql: string }[] {
  return readdirSync("prisma/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f.replace(/\.sql$/, ""), sql: readFileSync(join("prisma/migrations", f), "utf8") }));
}

const DEMO_TICKERS: { symbol: string; name: string; gics: string; ai?: string; watchlisted?: boolean; marketCap?: number; forwardPE?: number }[] = [
  { symbol: "NVDA", name: "NVIDIA", gics: "g_info_tech", ai: "ai_compute_gpu", watchlisted: true, marketCap: 3200, forwardPE: 34 },
  { symbol: "MU", name: "Micron", gics: "g_info_tech", ai: "ai_memory", watchlisted: true, marketCap: 130, forwardPE: 11 },
  { symbol: "AVGO", name: "Broadcom", gics: "g_info_tech", ai: "ai_custom_silicon", watchlisted: true, marketCap: 780, forwardPE: 28 },
  { symbol: "VRT", name: "Vertiv", gics: "g_industrials", ai: "ai_power", marketCap: 42, forwardPE: 33 },
  { symbol: "JPM", name: "JPMorgan", gics: "g_financials", marketCap: 620, forwardPE: 12 },
];

function main(): void {
  const file = databaseFile();
  mkdirSync(dirname(file) || ".", { recursive: true });
  const db = new DatabaseSync(file) as unknown as SqlDb;
  db.exec("PRAGMA journal_mode=WAL;");
  applyMigrations(db, loadMigrations());

  insertSectors(db, [...GICS_SEEDS, ...AI_INFRA_SEEDS]);
  for (const t of DEMO_TICKERS) {
    upsertTicker(db, { symbol: t.symbol, name: t.name, watchlisted: t.watchlisted, marketCap: t.marketCap, forwardPE: t.forwardPE });
    linkTickerSector(db, t.symbol, t.gics);
    if (t.ai) linkTickerSector(db, t.symbol, t.ai);
  }

  const digest = synthesize({
    asOf: new Date().toISOString().slice(0, 10),
    breadth: { pctAbove50dma: 28, advancers: 143, decliners: 357 },
    tripwires: [{ id: "mem_exit", severity: "critical", message: "Memory-exit signal", evidence: "manual:capex_flag=-1" }],
  });
  saveDigest(db, { d: digest.asOf, dataJson: JSON.stringify(digest) });

  console.log(
    `\u2713 seeded: ${countRows(db, "Sector")} sectors, ${countRows(db, "Ticker")} tickers, ` +
      `${countRows(db, "TickerSector")} links, ${countRows(db, "Digest")} digest(s) → ${file}`,
  );
  (db as unknown as { close: () => void }).close();
}

main();
