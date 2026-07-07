"use server";
// Home-page server actions: refresh the morning read (with the model, for narration)
// and refresh market data only (no model). Both spawn detached engine jobs and return
// immediately; the RunStatusBar client polls for progress.
import { revalidatePath } from "next/cache";
import { isRunActive } from "@engine/jobs/run-lock";
import { spawnJob, runLockPath } from "@/lib/run-trigger";

export type RunResult = { ok: boolean; error?: string };

function busyGuard(): RunResult | null {
  if (isRunActive({ path: runLockPath() })) {
    return { ok: false, error: "A run is already in progress. Wait for it to finish." };
  }
  return null;
}

/** Full overnight chain (data refresh + deterministic digest + model narration). */
export async function refreshDigestAction(): Promise<RunResult> {
  const busy = busyGuard();
  if (busy) return busy;
  spawnJob("overnight", [], { manageLlama: true });
  revalidatePath("/");
  return { ok: true };
}

/** Market data only: prices/stats/news/earnings/rules. No model booted. */
export async function refreshDataAction(): Promise<RunResult> {
  const busy = busyGuard();
  if (busy) return busy;
  spawnJob("refresh_data", [], { manageLlama: false });
  revalidatePath("/");
  return { ok: true };
}
