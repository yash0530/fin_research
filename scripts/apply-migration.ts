#!/usr/bin/env tsx
// Applies pending additive migrations to the SQLite DB named by DATABASE_URL.
// Sets WAL + busy_timeout (SQLite hardening) on open. Matches the ENGINE
// convention: hand-written SQL, applied in order, tracked in _migrations.
//
// Usage: tsx scripts/apply-migration.ts

import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations, type SqlDb } from "../src/db/migrate";

function databaseFile(): string {
  let url = process.env.DATABASE_URL;
  if (!url && existsSync(".env")) {
    const line = readFileSync(".env", "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith("DATABASE_URL="));
    if (line) url = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  }
  if (!url) throw new Error("DATABASE_URL not set (see .env.example)");
  return url.replace(/^file:/, "");
}

const MIGRATIONS_DIR = "prisma/migrations";

function loadMigrations(): { name: string; sql: string }[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f.replace(/\.sql$/, ""), sql: readFileSync(join(MIGRATIONS_DIR, f), "utf8") }));
}

function main(): void {
  const file = databaseFile();
  mkdirSync(dirname(file) || ".", { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA busy_timeout=8000;");

  const migrations = loadMigrations();
  const applied = applyMigrations(db as unknown as SqlDb, migrations);
  db.close();

  if (applied.length === 0) {
    console.log(`\u2713 DB up to date (${migrations.length} migration(s) known): ${file}`);
  } else {
    console.log(`\u2713 applied ${applied.length} migration(s): ${applied.join(", ")}`);
  }
}

main();
