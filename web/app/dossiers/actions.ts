"use server";
// Server actions for on-demand runs. Each mutating action spawns a detached engine
// job (never blocks the request) and returns immediately; the client polls
// getRunStatusAction for progress. The authoritative single-run guard lives in the
// spawned process (acquireRunLock); the check here is fast UI feedback.
import { revalidatePath } from "next/cache";
import { isRunActive } from "@engine/jobs/run-lock";
import { spawnJob, runLockPath } from "@/lib/run-trigger";
import { getRunStatus, type RunStatus } from "@/lib/run-status";

export type RunResult = { ok: boolean; error?: string };

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** Boot the model, run the multi-agent deep-dive on 1+ tickers, then free the RAM. */
export async function runDeepDiveAction(symbolsCsv: string): Promise<RunResult> {
  if (isRunActive({ path: runLockPath() })) {
    return { ok: false, error: "A run is already in progress. Wait for it to finish." };
  }
  const symbols = symbolsCsv
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (symbols.length === 0) return { ok: false, error: "Enter at least one ticker." };
  const bad = symbols.filter((s) => !TICKER_RE.test(s));
  if (bad.length) return { ok: false, error: `Not valid ticker(s): ${bad.join(", ")}` };

  spawnJob("dossier", [`--symbols=${symbols.join(",")}`], { manageLlama: true });
  revalidatePath("/dossiers");
  return { ok: true };
}

export async function getRunStatusAction(): Promise<RunStatus> {
  return getRunStatus();
}
