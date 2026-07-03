// The scheduler's per-tick logic, wired to the REAL DB but with the heavy work
// (overnight chain, dossier drain) INJECTED so it's unit-testable with fakes and no
// network. scripts/scheduler.ts owns the runtime (60s loop, wake detection, llama
// watchdog, launchd) and supplies the live chain/drain functions.
//
// Decision core: evaluateCatchUp reads the latest Digest date and asks the tested
// src/schedule/wake.shouldCatchUp whether we owe today's morning digest. The `--once`
// verification pass calls evaluateCatchUp ONLY (read-only, no side effects); the live
// loop calls schedulerTick, which either catches up (chain) or, when idle, drains.

import type { SqlDb } from "../db/migrate";
import { loadLatestDigest } from "../db/queries";
import { shouldCatchUp } from "./wake";
import { marketDate as marketDateNY } from "../lib/market-date";

export type CatchUpWindow = { windowStartHour?: number; windowEndHour?: number };

export type CatchUpDecision = {
  /** today's market date (UTC), the digest guard key */
  marketDate: string;
  /** the most recent Digest row's date, or null when the book is empty */
  lastDigestDate: string | null;
  /** true ⇒ we owe today's morning digest and are inside the morning window */
  due: boolean;
};

/** Read-only decision: do we owe today's morning digest right now? */
export function evaluateCatchUp(db: SqlDb, now: Date, window: CatchUpWindow = {}): CatchUpDecision {
  const marketDate = marketDateNY(now);
  const lastDigestDate = loadLatestDigest(db)?.d ?? null;
  const due = shouldCatchUp({
    hour: now.getHours(),
    lastDigestMarketDate: lastDigestDate,
    todayMarketDate: marketDate,
    ...(window.windowStartHour !== undefined ? { windowStartHour: window.windowStartHour } : {}),
    ...(window.windowEndHour !== undefined ? { windowEndHour: window.windowEndHour } : {}),
  });
  return { marketDate, lastDigestDate, due };
}

export type TickDeps = {
  db: SqlDb;
  /** Injectable clock (default: real now). */
  now?: () => Date;
  window?: CatchUpWindow;
  /** Morning catch-up: run the overnight chain (+ daily backup). Injected fake in tests. */
  runChain: () => Promise<void>;
  /** Idle work: recoverStale + drain the dossier queue. Injected fake in tests. */
  drainDossier: () => Promise<void>;
  log?: (msg: string) => void;
};

export type TickResult = CatchUpDecision & {
  /** ran the overnight chain this tick */
  caughtUp: boolean;
  /** ran the dossier drain this tick */
  drained: boolean;
};

/**
 * One live decision tick: when we owe today's digest and it's the morning window,
 * run the overnight chain; otherwise (idle) drain the dossier queue. Exactly one of
 * chain / drain fires per tick, so the morning digest always lands before dossiers.
 */
export async function schedulerTick(deps: TickDeps): Promise<TickResult> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? (() => {});
  const decision = evaluateCatchUp(deps.db, now, deps.window ?? {});

  if (decision.due) {
    log(`[scheduler] catch-up: no digest for ${decision.marketDate} → running overnight chain`);
    await deps.runChain();
    return { ...decision, caughtUp: true, drained: false };
  }

  // Idle: today's digest is present (or we're outside the window) → drain dossiers.
  await deps.drainDossier();
  return { ...decision, caughtUp: false, drained: true };
}
