// Server-only: spawn an engine job as a DETACHED child process.
//
// The heavy work (a 40-minute dossier, the digest chain) must NOT run inside the
// Next.js request — it runs in the same separate `tsx scripts/job.ts` process the
// CLI uses. A model-bearing run is spawned with `--manage-llama`, so THAT process
// boots llama-server, runs, and kills it on exit (freeing RAM). The web app only
// ever spawns and then polls the shared SQLite DB for progress.
import { spawn } from "node:child_process";
import { openSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

/** Absolute repo root (parent of `web/`). Where scripts/, data/, node_modules live. */
export function repoRoot(): string {
  if (process.env.REPO_ROOT) return process.env.REPO_ROOT;
  const cwd = process.cwd();
  // `next dev`/`next start` run from web/; a direct run may be from the repo root.
  if (existsSync(join(cwd, "scripts", "job.ts"))) return cwd;
  return resolve(cwd, "..");
}

/** Absolute path to the single-run lockfile the spawned job writes. */
export function runLockPath(): string {
  return join(repoRoot(), "data", "run.lock");
}

export type SpawnedRun = { pid: number | null; logFile: string };

/**
 * Spawn `tsx scripts/job.ts <name> [args] [--manage-llama]` detached, with stdout+
 * stderr redirected to a per-run logfile under data/logs/. Returns immediately.
 * DATABASE_URL is pinned to the repo's absolute db path so cwd can't ambiguate it.
 */
export function spawnJob(
  name: string,
  args: string[],
  opts: { manageLlama?: boolean } = {},
): SpawnedRun {
  const root = repoRoot();
  const logsDir = join(root, "data", "logs");
  mkdirSync(logsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = join(logsDir, `ondemand-${name}-${ts}.log`);
  const out = openSync(logFile, "a");

  const tsxBin = join(root, "node_modules", ".bin", "tsx");
  const argv = ["scripts/job.ts", name, ...args, ...(opts.manageLlama ? ["--manage-llama"] : [])];

  const child = spawn(tsxBin, argv, {
    cwd: root,
    detached: true,
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
      DATABASE_URL: `file:${join(root, "data", "engine.db")}`,
    },
  });
  child.unref();
  return { pid: child.pid ?? null, logFile };
}
