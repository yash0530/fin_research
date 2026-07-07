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
import { withLlamaServer } from "../src/analyst/llama-lifecycle";
import { acquireRunLock, releaseRunLock, setLockLlamaPid } from "../src/jobs/run-lock";

loadDotEnv();

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { name?: string; list: boolean; symbols?: string[]; dossierId?: string; force?: boolean; manageLlama: boolean } {
  let name: string | undefined;
  let list = false;
  let symbols: string[] | undefined;
  let dossierId: string | undefined;
  let force = false;
  let manageLlama = false;
  for (const arg of argv) {
    if (arg === "--list") list = true;
    else if (arg === "--force") force = true;
    else if (arg === "--manage-llama") manageLlama = true;
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
  return { list, ...(name ? { name } : {}), ...(symbols ? { symbols } : {}), ...(dossierId ? { dossierId } : {}), force, manageLlama };
}

function printList(): void {
  console.log("Registered jobs:");
  for (const j of jobCatalog()) console.log(`  ${j.name.padEnd(14)} ${j.describe}`);
}

async function main(): Promise<void> {
  const { name, list, symbols, dossierId, force, manageLlama } = parseArgs(process.argv.slice(2));

  if (list || !name) {
    printList();
    if (!name && !list) {
      console.error("\nNo job specified. Usage: npm run job -- <name> [--symbols=A,B] [--manage-llama]");
      process.exit(2);
    }
    return;
  }

  // --manage-llama: this process OWNS the model for its lifetime — take the single-run
  // lock (refuse if another run holds it), boot llama-server, run the job, then kill the
  // model to free RAM and release the lock. Data-only jobs run without it (no boot).
  if (manageLlama) {
    const acq = acquireRunLock({ ownerPid: process.pid, job: name, ...(symbols ? { symbols } : {}) });
    if (!acq.ok) {
      console.error(
        `[BUSY] a run is already in progress (pid ${acq.heldBy.ownerPid}, job "${acq.heldBy.job}"). Aborting.`,
      );
      process.exit(3);
    }
  }

  const db = openDb();
  const registry = buildLiveRegistry(db);
  const entry = registry.find((j) => j.name === name);
  if (!entry) {
    console.error(`Unknown job "${name}".`);
    printList();
    if (manageLlama) releaseRunLock();
    process.exit(2);
    return;
  }

  const started = Date.now();
  try {
    const runOnce = () => entry.run(symbols, { dossierId, force });
    const outcome = manageLlama
      ? await withLlamaServer(runOnce, {
          logFile: "data/logs/llama-ondemand.log",
          log: (m) => console.log(`[llama] ${m}`),
          onStarted: (h) => setLockLlamaPid(h.pid),
        })
      : await runOnce();
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[${outcome.ok ? "OK" : "FAIL"}] ${entry.name} (${secs}s)\n${outcome.detail}`);
    process.exitCode = outcome.ok ? 0 : 1;
  } catch (e) {
    console.error(`[ERROR] ${entry.name}: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  } finally {
    (db as unknown as { close?: () => void }).close?.();
    if (manageLlama) releaseRunLock();
  }
}

void main();
