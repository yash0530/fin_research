"use server";
// Home-page server actions: refresh the morning read (with the model, for narration)
// and refresh market data only (no model). Both spawn detached engine jobs and return
// immediately; the RunStatusBar client polls for progress. Also home for
// `getRunStatusAction`, the shared poll endpoint `components/run-ui.tsx` calls from
// everywhere in the app (moved here from the now-deleted `app/dossiers/actions.ts`).
import { revalidatePath } from "next/cache";
import { isRunActive } from "@engine/jobs/run-lock";
import { spawnJob, runLockPath } from "@/lib/run-trigger";
import { getRunStatus, type RunStatus } from "@/lib/run-status";
import { openWritableDb } from "@/lib/engine-write";

export type RunResult = { ok: boolean; error?: string };

export async function getRunStatusAction(): Promise<RunStatus> {
  return getRunStatus();
}

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

// ── Sourcing Inbox actions (dashboard Candidate rows) ────────────────────────

/** Promote an INBOX candidate to the watchlist (same shape as the ticker page's toggle). */
export async function watchCandidateAction(symbol: string): Promise<RunResult> {
  if (!symbol) return { ok: false, error: "Symbol is required" };
  const db = await openWritableDb();
  if (!db) return { ok: false, error: "Database is not writable" };
  try {
    const symbolUpper = symbol.toUpperCase();
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE "Ticker" SET "watchlisted"=1 WHERE "symbol"=?').run(symbolUpper);
    db.prepare(
      'INSERT INTO "WatchlistEntry" ("symbol","userLocked","createdAt","updatedAt") VALUES (?,1,?,?) ' +
        'ON CONFLICT("symbol") DO UPDATE SET updatedAt=excluded.updatedAt',
    ).run(symbolUpper, nowIso, nowIso);
    db.prepare('UPDATE "Candidate" SET "userState"=\'WATCHLIST\', "computedAt"=? WHERE "symbol"=?').run(
      nowIso,
      symbolUpper,
    );
    revalidatePath("/");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to add to watchlist" };
  }
}

/** Archive an INBOX candidate (out of the Sourcing Inbox, not deleted). */
export async function archiveCandidateAction(symbol: string): Promise<RunResult> {
  if (!symbol) return { ok: false, error: "Symbol is required" };
  const db = await openWritableDb();
  if (!db) return { ok: false, error: "Database is not writable" };
  try {
    const symbolUpper = symbol.toUpperCase();
    db.prepare('UPDATE "Candidate" SET "userState"=\'ARCHIVED\', "computedAt"=? WHERE "symbol"=?').run(
      new Date().toISOString(),
      symbolUpper,
    );
    revalidatePath("/");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to archive candidate" };
  }
}
