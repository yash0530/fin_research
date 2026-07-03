#!/usr/bin/env tsx
// Scheduler daemon. In production it ticks every 60s: it detects a wake (long
// inter-tick gap) and, in the morning window with no digest for today's market
// date, runs the overnight chain; between cron runs it drains the dossier queue.
// The heavy work (jobs, LLM) is wired in the app; this script owns the SCHEDULE.
//
//   tsx scripts/scheduler.ts --once   → evaluate one decision tick and exit (verifiable)
//   tsx scripts/scheduler.ts          → run the long-lived tick loop
//
// Decision logic is the tested src/schedule/wake module.

import { execSync } from "node:child_process";
import { shouldCatchUp, detectedWake } from "../src/schedule/wake";
import { shouldKickstart } from "../src/schedule/watchdog";

function marketDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

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

/** One decision tick. In production `runOvernight` would be invoked when due. */
function decideTick(now: Date, lastDigestMarketDate: string | null): boolean {
  const due = shouldCatchUp({
    hour: now.getHours(),
    lastDigestMarketDate,
    todayMarketDate: marketDate(now),
  });
  console.log(`[scheduler] ${now.toISOString()} shouldCatchUp=${due}`);
  return due;
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const now = new Date();
  // lastDigestMarketDate would come from loadLatestDigest(db); null here (no DB in this skeleton).
  decideTick(now, null);
  await watchdogTick(now.getTime());

  if (once) {
    console.log("[scheduler] --once: single tick complete.");
    return;
  }

  console.log("[scheduler] entering 60s tick loop (Ctrl-C to stop)…");
  let lastTick = Date.now();
  setInterval(() => {
    const nowMs = Date.now();
    if (detectedWake(lastTick, nowMs)) {
      console.log("[scheduler] wake detected → catch-up evaluation");
    }
    decideTick(new Date(nowMs), null);
    void watchdogTick(nowMs);
    lastTick = nowMs;
  }, 60_000);
}

void main();
