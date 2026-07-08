// On-demand llama-server lifecycle: boot the Qwen model into RAM, wait until it's
// actually serving, run work, then KILL it to free the RAM. This replaces the old
// always-resident launchd + watchdog model (`scripts/scheduler.ts`).
//
// The heavy model process is a detached child of whichever run owns it (the
// `job.ts --manage-llama` process). `withLlamaServer` guarantees teardown in a
// `finally`, so the model never outlives its run. The pure/async pieces take
// injectable `spawn`/`fetch`/`kill`/`isAlive` so they unit-test with no real
// process or network (the FakeProvider discipline).

import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import {
  LLAMA_HEALTH_URL,
  LLAMA_BOOT_TIMEOUT_MS,
  LLAMA_STOP_GRACE_MS,
  llamaLaunchArgv,
  type LlamaProfile,
} from "../config/llama";

type HealthResponse = { ok: boolean };
export type FetchLike = (url: string, init?: unknown) => Promise<HealthResponse>;
export type SpawnLike = (cmd: string, args: string[]) => { pid?: number; unref?: () => void };
export type KillLike = (pid: number, signal: NodeJS.Signals) => void;

export type LlamaHandle = {
  /** pid of the server WE started; null when adopted or unknown. */
  pid: number | null;
  /** true when a healthy server was already up and we reused it (won't be killed). */
  adopted: boolean;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const realFetch: FetchLike = (url, init) => fetch(url, init as RequestInit) as unknown as Promise<HealthResponse>;

/** One health probe with a short timeout; false on any error / non-2xx. */
async function probeHealth(url: string, fetchImpl: FetchLike): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3_000);
    const res = await fetchImpl(url, { signal: ctl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/** Poll GET /health until it returns ok, or throw after `timeoutMs`. */
export async function waitForHealth(
  url: string,
  timeoutMs: number,
  opts: { fetchImpl?: FetchLike; intervalMs?: number } = {},
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? realFetch;
  const intervalMs = opts.intervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;
  do {
    if (await probeHealth(url, fetchImpl)) return;
    await sleep(intervalMs);
  } while (Date.now() < deadline);
  throw new Error(`llama-server not healthy at ${url} within ${timeoutMs}ms`);
}

function defaultSpawn(logFile?: string): SpawnLike {
  return (cmd, args) => {
    const stdio: "ignore" | ["ignore", number, number] = logFile
      ? ["ignore", openSync(logFile, "a"), openSync(logFile, "a")]
      : "ignore";
    const child = spawn(cmd, args, {
      detached: true,
      stdio,
      env: { ...process.env, PATH: "/opt/homebrew/bin:/usr/bin:/bin" },
    });
    return child;
  };
}

export type StartOpts = {
  profile?: LlamaProfile;
  healthUrl?: string;
  bootTimeoutMs?: number;
  argv?: string[];
  spawnImpl?: SpawnLike;
  fetchImpl?: FetchLike;
  logFile?: string;
  log?: (m: string) => void;
  /** called right after a successful boot with the started handle (persist the pid). */
  onStarted?: (h: LlamaHandle) => void;
};

/**
 * Boot llama-server and wait until it serves. If a healthy server is ALREADY up
 * (a manual dev session, or a leftover the run-lock's stale-reaper hasn't touched),
 * adopt it instead of double-booting port 8000 — and mark it `adopted` so teardown
 * leaves it alone.
 */
export async function startLlamaServer(opts: StartOpts = {}): Promise<LlamaHandle> {
  const healthUrl = opts.healthUrl ?? LLAMA_HEALTH_URL;
  const fetchImpl = opts.fetchImpl ?? realFetch;
  const log = opts.log ?? (() => {});

  if (await probeHealth(healthUrl, fetchImpl)) {
    log("llama-server already healthy → adopting existing process");
    const handle: LlamaHandle = { pid: null, adopted: true };
    opts.onStarted?.(handle);
    return handle;
  }

  const argv = opts.argv ?? llamaLaunchArgv(opts.profile);
  const [cmd, ...args] = argv;
  log(`booting llama-server: ${cmd} ${args.join(" ")}`);
  const child = (opts.spawnImpl ?? defaultSpawn(opts.logFile))(cmd, args);
  child.unref?.();

  await waitForHealth(healthUrl, opts.bootTimeoutMs ?? LLAMA_BOOT_TIMEOUT_MS, { fetchImpl });
  const handle: LlamaHandle = { pid: child.pid ?? null, adopted: false };
  log(`llama-server healthy (pid ${handle.pid ?? "?"})`);
  opts.onStarted?.(handle);
  return handle;
}

export type StopOpts = {
  graceMs?: number;
  killImpl?: KillLike;
  aliveImpl?: (pid: number) => boolean;
  log?: (m: string) => void;
};

const realKill: KillLike = (pid, sig) => {
  try {
    process.kill(pid, sig);
  } catch {
    /* already gone */
  }
};

const realAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Kill the model and free its RAM: SIGTERM, wait a grace window for a clean exit,
 * then SIGKILL if it's still resident. Adopted servers (we didn't start them) are
 * left running.
 */
export async function stopLlamaServer(handle: LlamaHandle, opts: StopOpts = {}): Promise<void> {
  const log = opts.log ?? (() => {});
  if (handle.adopted) {
    log("llama-server was adopted (not started by us) → leaving it running");
    return;
  }
  if (handle.pid == null) {
    log("no llama pid recorded → nothing to stop");
    return;
  }
  const pid = handle.pid;
  const kill = opts.killImpl ?? realKill;
  const alive = opts.aliveImpl ?? realAlive;
  const graceMs = opts.graceMs ?? LLAMA_STOP_GRACE_MS;

  log(`stopping llama-server (pid ${pid}) → SIGTERM`);
  kill(pid, "SIGTERM");
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) {
      log(`llama-server pid ${pid} exited cleanly`);
      return;
    }
    await sleep(300);
  }
  log(`llama-server pid ${pid} still alive after ${graceMs}ms → SIGKILL`);
  kill(pid, "SIGKILL");
}

/** boot → run fn → ALWAYS tear down. The wrapper `job.ts --manage-llama` uses. */
export async function withLlamaServer<T>(
  fn: () => Promise<T>,
  opts: StartOpts & StopOpts = {},
): Promise<T> {
  const handle = await startLlamaServer(opts);
  try {
    return await fn();
  } finally {
    await stopLlamaServer(handle, opts);
  }
}
