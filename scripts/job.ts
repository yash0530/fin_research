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
import { type LlamaProfile } from "../src/config/llama";
import { acquireRunLock, releaseRunLock, setLockLlamaPid } from "../src/jobs/run-lock";

loadDotEnv();

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  name?: string;
  list: boolean;
  symbols?: string[];
  dossierId?: string;
  force?: boolean;
  manageLlama: boolean;
  llamaProfile: LlamaProfile;
  runId?: string;
  runType?: string;
  runTarget?: string;
  budgetMin?: number;
} {
  let name: string | undefined;
  let list = false;
  let symbols: string[] | undefined;
  let dossierId: string | undefined;
  let force = false;
  let manageLlama = false;
  let llamaProfile: LlamaProfile = "deep";
  let runId: string | undefined;
  let runType: string | undefined;
  let runTarget: string | undefined;
  let budgetMin: number | undefined;
  for (const arg of argv) {
    if (arg === "--list") list = true;
    else if (arg === "--force") force = true;
    else if (arg === "--manage-llama") manageLlama = true;
    else if (arg.startsWith("--llama-profile=")) {
      const val = arg.slice("--llama-profile=".length).trim().toLowerCase();
      if (val === "fast" || val === "deep") {
        llamaProfile = val;
      }
    } else if (arg.startsWith("--symbols=")) {
      symbols = arg
        .slice("--symbols=".length)
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg.startsWith("--dossier=")) {
      dossierId = arg.slice("--dossier=".length).trim();
    } else if (arg.startsWith("--run-id=")) {
      runId = arg.slice("--run-id=".length).trim();
    } else if (arg.startsWith("--type=")) {
      runType = arg.slice("--type=".length).trim();
    } else if (arg.startsWith("--target=")) {
      runTarget = arg.slice("--target=".length).trim();
    } else if (arg.startsWith("--budget-min=")) {
      const n = Number(arg.slice("--budget-min=".length).trim());
      if (Number.isFinite(n) && n > 0) budgetMin = n;
    } else if (arg.startsWith("--task=")) {
      name = arg.slice("--task=".length).trim();
    } else if (!arg.startsWith("--") && !name) {
      name = arg;
    }
  }
  return {
    list,
    ...(name ? { name } : {}),
    ...(symbols ? { symbols } : {}),
    ...(dossierId ? { dossierId } : {}),
    ...(runId ? { runId } : {}),
    ...(runType ? { runType } : {}),
    ...(runTarget ? { runTarget } : {}),
    ...(budgetMin !== undefined ? { budgetMin } : {}),
    force,
    manageLlama,
    llamaProfile,
  };
}

function printList(): void {
  console.log("Registered jobs:");
  for (const j of jobCatalog()) console.log(`  ${j.name.padEnd(14)} ${j.describe}`);
}

async function main(): Promise<void> {
  const {
    name,
    list,
    symbols,
    dossierId,
    force,
    manageLlama,
    llamaProfile,
    runId,
    runType,
    runTarget,
    budgetMin,
  } = parseArgs(process.argv.slice(2));

  if (list || !name) {
    printList();
    if (!name && !list) {
      console.error(
        "\nNo job specified. Usage: npm run job -- <name> [--symbols=A,B] [--manage-llama] [--llama-profile=fast|deep] [--run-id=id] [--type=type] [--target=target] [--budget-min=mins]"
      );
      process.exit(2);
    }
    return;
  }

  const db = openDb();
  let finalManageLlama = manageLlama || name === "research_run";
  let finalLlamaProfile = llamaProfile;

  if (name === "research_run") {
    if (!runId) {
      console.error("Error: --run-id is required for research_run.");
      (db as any).close?.();
      process.exit(2);
    }
    const row = db.prepare('SELECT "profile" FROM "ResearchRun" WHERE "id" = ?').get(runId) as { profile: string } | undefined;
    if (!row) {
      console.error(`Error: ResearchRun ${runId} not found.`);
      (db as any).close?.();
      process.exit(2);
    }
    finalLlamaProfile = row.profile as LlamaProfile;
  }

  // --manage-llama: this process OWNS the model for its lifetime — take the single-run
  // lock (refuse if another run holds it), boot llama-server, run the job, then kill the
  // model to free RAM and release the lock. Data-only jobs run without it (no boot).
  if (finalManageLlama) {
    const acq = acquireRunLock({ ownerPid: process.pid, job: name, ...(symbols ? { symbols } : {}) });
    if (!acq.ok) {
      console.error(
        `[BUSY] a run is already in progress (pid ${acq.heldBy.ownerPid}, job "${acq.heldBy.job}"). Aborting.`,
      );
      (db as any).close?.();
      process.exit(3);
    }
  }

  const registry = buildLiveRegistry(db);
  const entry = registry.find((j) => j.name === name);
  if (!entry) {
    console.error(`Unknown job "${name}".`);
    printList();
    if (finalManageLlama) releaseRunLock();
    (db as any).close?.();
    process.exit(2);
    return;
  }

  const started = Date.now();
  try {
    const runOnce = () => entry.run(symbols, { dossierId, force, runId, runType, runTarget, budgetMin });
    const outcome = finalManageLlama
      ? await withLlamaServer(runOnce, {
          profile: finalLlamaProfile,
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
    if (finalManageLlama) releaseRunLock();
  }
}

void main();
