#!/usr/bin/env tsx
// Scheduler daemon — the platform that runs itself. It ticks every 60s:
//   • morning window + no digest for today's market date → run the overnight chain
//     (one JobRun row per step, exactly as the CLI does) then the daily backup;
//   • otherwise (idle) → recoverStale + drain the dossier queue with the live
//     providers/fetchers, one at a time (respects the llama single-flight lock);
//   • every tick, probe the llama-server and restart it if it's down past cooloff;
//   • detect a wake (long inter-tick gap) and heartbeat every 10 ticks.
// A mutex ensures a slow chain/drain never lets the next tick double-fire.
//
//   tsx scripts/scheduler.ts --once   → ONE read-only decision pass, then exit 0
//                                        (verifiable; no chain/drain/restart side effects)
//   tsx scripts/scheduler.ts          → the long-lived 60s tick loop
//
// The scheduling DECISIONS are the tested src/schedule modules (wake, watchdog, tick);
// the LIVE jobs come from the shared src/jobs/registry-live (same code path as the CLI).

import { execSync } from "node:child_process";
import { loadDotEnv, openDb, buildLiveRegistry, drainDossierQueueLive } from "../src/jobs/registry-live";
import { evaluateCatchUp, schedulerTick } from "../src/schedule/tick";
import { detectedWake } from "../src/schedule/wake";
import { shouldKickstart } from "../src/schedule/watchdog";
import type { JobEntry } from "../src/jobs/registry-live";
import type { SqlDb } from "../src/db/migrate";

const TICK_MS = 60_000;
const HEARTBEAT_EVERY = 10; // ticks

// ── llama-server watchdog (see src/schedule/watchdog.ts for the incident note) ──
const LLAMA_HEALTH_URL = "http://localhost:8000/health";
const LLAMA_SERVICE = "com.local.llamacpp";
const LLAMA_PLIST = `${process.env.HOME}/Library/LaunchAgents/${LLAMA_SERVICE}.plist`;
let lastKickMs = 0;

async function llamaHealthy(): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3_000);
    const res = await fetch(LLAMA_HEALTH_URL, { signal: ctl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/** Restart the launchd service; bootstrap first in case it got unloaded entirely. */
function kickstartLlama(nowMs: number): void {
  lastKickMs = nowMs;
  const uid = process.getuid?.() ?? 501;
  for (const cmd of [
    `launchctl bootstrap gui/${uid} ${LLAMA_PLIST}`,
    `launchctl kickstart -k gui/${uid}/${LLAMA_SERVICE}`,
  ]) {
    try {
      execSync(cmd, { stdio: "pipe" });
    } catch {
      /* bootstrap fails when already loaded — expected; kickstart result is what matters */
    }
  }
  console.log(`[scheduler] llama-server DOWN → issued launchctl restart (${LLAMA_SERVICE})`);
}

async function watchdogTick(nowMs: number): Promise<void> {
  const healthOk = await llamaHealthy();
  if (shouldKickstart({ healthOk, lastKickMs, nowMs })) kickstartLlama(nowMs);
  else if (!healthOk) console.log("[scheduler] llama-server down; in restart cooloff");
}

// ── live tick wiring (shared registry: same code path as the job CLI) ─────────

/** Morning catch-up = the `overnight` chain (one JobRun/step) then the daily `backup`. */
function makeRunChain(registry: JobEntry[]): () => Promise<void> {
  const overnight = registry.find((j) => j.name === "overnight");
  const backup = registry.find((j) => j.name === "backup");
  return async () => {
    if (overnight) {
      const o = await overnight.run();
      console.log(`[scheduler] ${o.ok ? "overnight ✓" : "overnight ✗"} — ${o.detail}`);
    }
    if (backup) {
      const b = await backup.run();
      console.log(`[scheduler] ${b.detail}`);
    }
  };
}

/** One live tick under a re-entrancy mutex, plus the llama watchdog. */
async function liveTick(db: SqlDb, runChain: () => Promise<void>): Promise<void> {
  const result = await schedulerTick({
    db,
    runChain,
    drainDossier: () => drainDossierQueueLive(db, (m) => console.log(m)),
    log: (m) => console.log(m),
  });
  if (!result.due) {
    console.log(`[scheduler] idle (digest ${result.lastDigestDate ?? "none"} / today ${result.marketDate})`);
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const once = process.argv.includes("--once");
  const db = openDb();

  if (once) {
    // Read-only decision pass: report what we WOULD do, take NO side effects
    // (no chain, no dossier drain, no llama restart). This is the verification gate;
    // in normal operation today's digest exists, so it short-circuits.
    const d = evaluateCatchUp(db, new Date());
    console.log(
      `[scheduler] --once: marketDate=${d.marketDate} lastDigest=${d.lastDigestDate ?? "none"} shouldCatchUp=${d.due}`,
    );
    console.log(
      d.due
        ? "[scheduler] --once: would run the overnight chain (no side effects in --once)."
        : "[scheduler] --once: up to date — nothing to do.",
    );
    (db as unknown as { close?: () => void }).close?.();
    return;
  }

  const registry = buildLiveRegistry(db);
  const runChain = makeRunChain(registry);

  console.log(`[scheduler] entering ${TICK_MS / 1000}s tick loop (Ctrl-C to stop)…`);
  let lastTick = Date.now();
  let ticks = 0;
  let busy = false; // mutex: a long chain/drain must not let the next tick double-fire

  const tick = async (): Promise<void> => {
    const nowMs = Date.now();
    ticks += 1;
    if (detectedWake(lastTick, nowMs)) {
      console.log("[scheduler] wake detected (long inter-tick gap) → catch-up evaluation");
    }
    lastTick = nowMs;
    if (ticks % HEARTBEAT_EVERY === 0) {
      console.log(`[scheduler] heartbeat: ${ticks} ticks, ${new Date(nowMs).toISOString()}`);
    }

    await watchdogTick(nowMs);

    if (busy) {
      console.log("[scheduler] previous tick still working → skipping this tick");
      return;
    }
    busy = true;
    try {
      await liveTick(db, runChain);
    } catch (e) {
      console.error(`[scheduler] tick error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
    }
  };

  await tick(); // fire immediately on boot, then every TICK_MS
  setInterval(() => void tick(), TICK_MS);
}

void main();
