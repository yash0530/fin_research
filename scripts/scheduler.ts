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

import { shouldCatchUp, detectedWake } from "../src/schedule/wake";

function marketDate(now: Date): string {
  return now.toISOString().slice(0, 10);
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

function main(): void {
  const once = process.argv.includes("--once");
  const now = new Date();
  // lastDigestMarketDate would come from loadLatestDigest(db); null here (no DB in this skeleton).
  decideTick(now, null);

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
    lastTick = nowMs;
  }, 60_000);
}

main();
