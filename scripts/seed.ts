#!/usr/bin/env tsx
// Seeds the SQLite DB: applies migrations, inserts the dual-taxonomy sectors
// (GICS 11 + AI-infra 12), the FULL S&P universe from config/sp500.csv (each row
// linked to its GICS sector), the AI-infra membership as additive ai_* links, the
// credit-proxy benchmarks, and a sample digest. Idempotent (upserts). Run:
//   npm run seed                         (DATABASE_URL, default data/engine.db)
//   DATABASE_URL=file:./data/seed-check.db npm run seed

import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations, type SqlDb } from "../src/db/migrate";
import { insertSectors, saveDigest, countRows } from "../src/db/queries";
import { seedUniverse } from "../src/db/seed-helpers";
import { GICS_SEEDS, AI_INFRA_SEEDS, aiInfraLinks, CREDIT_BENCHMARKS } from "../src/config/sectors";
import { parseUniverseCsv, summarizeUniverse } from "../src/lib/universe";
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

function loadUniverse(): ReturnType<typeof parseUniverseCsv> {
  const path = "config/sp500.csv";
  if (!existsSync(path)) {
    console.warn("\u26a0 config/sp500.csv not found — seeding sectors + AI-infra only");
    return [];
  }
  return parseUniverseCsv(readFileSync(path, "utf8"));
}

function main(): void {
  const file = databaseFile();
  mkdirSync(dirname(file) || ".", { recursive: true });
  const db = new DatabaseSync(file) as unknown as SqlDb;
  db.exec("PRAGMA journal_mode=WAL;");
  applyMigrations(db, loadMigrations());

  insertSectors(db, [...GICS_SEEDS, ...AI_INFRA_SEEDS]);

  const universe = loadUniverse();
  const summary = summarizeUniverse(universe);
  const seeded = seedUniverse(db, {
    universe,
    aiLinks: aiInfraLinks(),
    benchmarks: CREDIT_BENCHMARKS,
  });

  const digest = synthesize({
    asOf: new Date().toISOString().slice(0, 10),
    breadth: { pctAbove50dma: 28, advancers: 143, decliners: 357 },
    tripwires: [{ id: "mem_exit", severity: "critical", message: "Memory-exit signal", evidence: "manual:capex_flag=-1" }],
  });
  saveDigest(db, { d: digest.asOf, dataJson: JSON.stringify(digest) });

  const sectors = countRows(db, "Sector");
  const tickers = countRows(db, "Ticker");
  const links = countRows(db, "TickerSector");
  console.log(
    `\u2713 seeded: ${tickers} tickers, ${sectors} sectors, ${links} links, ` +
      `${countRows(db, "Digest")} digest(s) → ${file}`,
  );
  console.log(
    `  universe: ${summary.total} S&P rows (${summary.mapped} GICS-mapped, ${summary.unmapped} unmapped) · ` +
      `AI-infra: ${seeded.aiTickers} new symbols + ${seeded.aiLinks} ai_* links · ${seeded.benchmarkTickers} benchmarks`,
  );
  (db as unknown as { close: () => void }).close();
}

main();
