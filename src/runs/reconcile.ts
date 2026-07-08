import { type SqlDb } from "../db/migrate";
import { readRunLock, releaseRunLock } from "../jobs/run-lock";

function defaultAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function defaultKill(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    /* already gone */
  }
}

/**
 * Reconciles running/pausing ResearchRuns. If their pid is dead or missing,
 * marks them as FAILED. Also checks the run-lock; if it's stale (owner pid is dead),
 * kills its associated llama-server process (if any) and deletes the lockfile.
 */
export function reconcileRuns(
  db: SqlDb,
  opts: {
    aliveImpl?: (pid: number) => boolean;
    killImpl?: (pid: number, signal: NodeJS.Signals) => void;
    lockPath?: string;
  } = {},
): void {
  const alive = opts.aliveImpl ?? defaultAlive;
  const kill = opts.killImpl ?? defaultKill;

  // Find all runs marked as RUNNING or PAUSING
  const runningRuns = db
    .prepare('SELECT "id", "pid", "status" FROM "ResearchRun" WHERE "status" IN (\'RUNNING\', \'PAUSING\')')
    .all() as { id: string; pid: number | null; status: string }[];

  for (const run of runningRuns) {
    if (run.pid === null || !alive(run.pid)) {
      db.prepare(
        'UPDATE "ResearchRun" SET "status" = \'FAILED\', "errorMessage" = ?, "completedAt" = datetime(\'now\', \'utc\'), "updatedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?'
      ).run("Orphaned run: process died.", run.id);
    }
  }

  // Check the run lock file
  const lock = readRunLock(opts.lockPath);
  if (lock) {
    if (!alive(lock.ownerPid)) {
      if (lock.llamaPid && alive(lock.llamaPid)) {
        kill(lock.llamaPid, "SIGKILL");
      }
      releaseRunLock(opts.lockPath);
    }
  }
}
