// A cross-process, single-run guard for on-demand runs.
//
// Each on-demand run owns a fresh llama-server; two concurrent runs would fight over
// port 8000 and the machine's RAM. The in-process `withLlmLock` can't see across
// processes (the web server and the spawned `job.ts` are different processes), so we
// use a pidfile that every process can read. It makes "a run is in progress" visible
// to the UI, and recovers from a crashed run: a lock whose owner pid is dead is
// stale → we reap the recorded llama pid (orphaned RAM) and take the lock.

import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type RunLockInfo = {
  ownerPid: number;
  job: string;
  symbols?: string[];
  startedAt: number; // epoch ms
  /** pid of the llama-server this run booted (for crash-time reaping). */
  llamaPid?: number | null;
};

export const DEFAULT_LOCK_PATH = process.env.RUN_LOCK_PATH ?? "data/run.lock";

function realAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readRunLock(path: string = DEFAULT_LOCK_PATH): RunLockInfo | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as RunLockInfo;
  } catch {
    return null;
  }
}

/** Is a LIVE run in progress? (a stale lock from a crashed run returns false) */
export function isRunActive(
  opts: { path?: string; aliveImpl?: (pid: number) => boolean } = {},
): boolean {
  const alive = opts.aliveImpl ?? realAlive;
  const l = readRunLock(opts.path ?? DEFAULT_LOCK_PATH);
  return !!l && alive(l.ownerPid);
}

export type AcquireResult = { ok: true } | { ok: false; heldBy: RunLockInfo };

/**
 * Acquire the run lock. Fails if a LIVE run holds it. If the lock is stale (owner pid
 * dead), reap the recorded llama pid so a crashed run doesn't leak RAM, then take it.
 */
export function acquireRunLock(
  info: Omit<RunLockInfo, "startedAt"> & { startedAt?: number },
  opts: {
    path?: string;
    killImpl?: (pid: number, signal: NodeJS.Signals) => void;
    aliveImpl?: (pid: number) => boolean;
  } = {},
): AcquireResult {
  const path = opts.path ?? DEFAULT_LOCK_PATH;
  const alive = opts.aliveImpl ?? realAlive;
  const kill =
    opts.killImpl ??
    ((p: number, s: NodeJS.Signals) => {
      try {
        process.kill(p, s);
      } catch {
        /* already gone */
      }
    });

  const existing = readRunLock(path);
  if (existing) {
    if (alive(existing.ownerPid)) return { ok: false, heldBy: existing };
    // Stale: the previous run died. Reap its orphaned model so RAM doesn't leak.
    if (existing.llamaPid && alive(existing.llamaPid)) kill(existing.llamaPid, "SIGKILL");
  }

  const full: RunLockInfo = { startedAt: Date.now(), ...info };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(full, null, 2));
  return { ok: true };
}

/** Record the booted llama pid on the held lock (so a later crash can reap it). */
export function setLockLlamaPid(llamaPid: number | null, path: string = DEFAULT_LOCK_PATH): void {
  const l = readRunLock(path);
  if (!l) return;
  l.llamaPid = llamaPid;
  try {
    writeFileSync(path, JSON.stringify(l, null, 2));
  } catch {
    /* best-effort */
  }
}

export function releaseRunLock(path: string = DEFAULT_LOCK_PATH): void {
  try {
    rmSync(path, { force: true });
  } catch {
    /* best-effort */
  }
}
