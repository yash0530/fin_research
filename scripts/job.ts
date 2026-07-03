#!/usr/bin/env tsx
// Job CLI — run any registered job against DATABASE_URL:
//   npm run job -- <name> [--symbols=A,B,C]
//   npm run job -- prices10y            # resumable 10y price backfill
//   npm run job -- overnight            # the full morning chain
//   npm run job -- --list               # list jobs (no DB, no network)
//
// The live registry (env + DB open, lazy yahoo2/Stooq/EDGAR/HttpProvider fetchers,
// the runnable job entries) lives in src/jobs/registry-live so the scheduler daemon
// shares one code path. `--list` uses jobCatalog() and never touches the wire.

import { loadDotEnv, openDb, buildLiveRegistry, jobCatalog } from "../src/jobs/registry-live";

loadDotEnv();

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { name?: string; list: boolean; symbols?: string[]; dossierId?: string } {
  let name: string | undefined;
  let list = false;
  let symbols: string[] | undefined;
  let dossierId: string | undefined;
  for (const arg of argv) {
    if (arg === "--list") list = true;
    else if (arg.startsWith("--symbols=")) {
      symbols = arg
        .slice("--symbols=".length)
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg.startsWith("--dossier=")) {
      dossierId = arg.slice("--dossier=".length).trim();
    } else if (arg.startsWith("--task=")) {
      name = arg.slice("--task=".length).trim();
    } else if (!arg.startsWith("--") && !name) {
      name = arg;
    }
  }
  return { list, ...(name ? { name } : {}), ...(symbols ? { symbols } : {}), ...(dossierId ? { dossierId } : {}) };
}

function printList(): void {
  console.log("Registered jobs:");
  for (const j of jobCatalog()) console.log(`  ${j.name.padEnd(14)} ${j.describe}`);
}

async function main(): Promise<void> {
  const { name, list, symbols, dossierId } = parseArgs(process.argv.slice(2));

  if (list || !name) {
    printList();
    if (!name && !list) {
      console.error("\nNo job specified. Usage: npm run job -- <name> [--symbols=A,B]");
      process.exit(2);
    }
    return;
  }

  const db = openDb();
  const registry = buildLiveRegistry(db);
  const entry = registry.find((j) => j.name === name);
  if (!entry) {
    console.error(`Unknown job "${name}".`);
    printList();
    process.exit(2);
    return;
  }

  const started = Date.now();
  try {
    const outcome = await entry.run(symbols, dossierId ? { dossierId } : undefined);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[${outcome.ok ? "OK" : "FAIL"}] ${entry.name} (${secs}s)\n${outcome.detail}`);
    process.exit(outcome.ok ? 0 : 1);
  } catch (e) {
    console.error(`[ERROR] ${entry.name}: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  } finally {
    (db as unknown as { close?: () => void }).close?.();
  }
}

void main();
