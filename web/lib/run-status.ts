// Server-only: the live status the UI polls. Assembles from three cheap sources —
// the run-lock (is a run in progress, and which), a short llama /health probe (is the
// model booted yet), and nothing else. Stage-level progress comes from the dossier
// pages re-rendering (the client also calls router.refresh()); this stays lightweight
// because it's polled every ~3s.
import { readRunLock, isRunActive } from "@engine/jobs/run-lock";
import { LLAMA_HEALTH_URL } from "@engine/config/llama";
import { runLockPath } from "./run-trigger";

export type RunPhase = "idle" | "booting" | "running";

export type RunStatus = {
  busy: boolean;
  phase: RunPhase;
  job?: string;
  symbols?: string[];
  llamaHealthy: boolean;
  startedAt?: number;
};

async function probeHealth(url: string): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2_500);
    const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export async function getRunStatus(): Promise<RunStatus> {
  const path = runLockPath();
  const lock = readRunLock(path);
  const busy = isRunActive({ path });
  const llamaHealthy = await probeHealth(LLAMA_HEALTH_URL);

  if (!busy || !lock) {
    return { busy: false, phase: "idle", llamaHealthy };
  }
  // A run holds the lock: model still loading → "booting"; serving → "running".
  const phase: RunPhase = llamaHealthy ? "running" : "booting";
  return {
    busy: true,
    phase,
    job: lock.job,
    ...(lock.symbols ? { symbols: lock.symbols } : {}),
    llamaHealthy,
    startedAt: lock.startedAt,
  };
}
