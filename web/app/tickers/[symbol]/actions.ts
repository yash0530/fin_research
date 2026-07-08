"use server";

import { revalidatePath } from "next/cache";
import { openWritableDb } from "../../../lib/engine-write";
import { spawnJob } from "../../../lib/run-trigger";
import { createResearchRun } from "@engine/runs/create";

export async function submitChecklistAction(
  symbol: string,
  action: string,
  thesis: string,
  invalidation: string,
  payload: any
): Promise<{ ok: boolean; error?: string }> {
  if (!symbol) return { ok: false, error: "Symbol is required" };
  
  const db = await openWritableDb();
  if (!db) return { ok: false, error: "Database is not writable" };

  try {
    const symbolUpper = symbol.toUpperCase();
    const nowIso = new Date().toISOString();

    // 1. Insert into JournalEntry
    db.prepare(`
      INSERT INTO "JournalEntry" ("symbol", "action", "thesis", "invalidation", "createdAt")
      VALUES (?, ?, ?, ?, ?)
    `).run(symbolUpper, action, thesis, invalidation || null, nowIso);

    // 2. Insert into DecisionSnapshot
    db.prepare(`
      INSERT INTO "DecisionSnapshot" ("symbol", "payload", "createdAt")
      VALUES (?, ?, ?)
    `).run(symbolUpper, JSON.stringify(payload), nowIso);

    revalidatePath(`/tickers/${symbolUpper}`);
    revalidatePath(`/journal`);
    return { ok: true };
  } catch (err: any) {
    console.error("Error in submitChecklistAction:", err);
    return { ok: false, error: err.message || "Failed to submit inversion checklist" };
  }
}

export async function toggleWatchlistAction(
  symbol: string,
  watchlisted: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!symbol) return { ok: false, error: "Symbol is required" };

  const db = await openWritableDb();
  if (!db) return { ok: false, error: "Database is not writable" };

  try {
    const symbolUpper = symbol.toUpperCase();
    const nowIso = new Date().toISOString();

    if (watchlisted) {
      // Add to watchlist
      db.prepare('UPDATE "Ticker" SET "watchlisted"=1 WHERE "symbol"=?').run(symbolUpper);
      
      db.prepare(`
        INSERT INTO "WatchlistEntry" ("symbol", "userLocked", "createdAt", "updatedAt") 
        VALUES (?, 1, ?, ?)
        ON CONFLICT("symbol") DO UPDATE SET updatedAt=excluded.updatedAt
      `).run(symbolUpper, nowIso, nowIso);

      db.prepare(`
        INSERT INTO "Candidate" ("symbol", "tier", "triggerTags", "qualification", "computedAt", "userState")
        VALUES (?, 3, '[]', 'Added manually', ?, 'WATCHLIST')
        ON CONFLICT("symbol") DO UPDATE SET userState='WATCHLIST', computedAt=excluded.computedAt
      `).run(symbolUpper, nowIso);
    } else {
      // Remove from watchlist
      db.prepare('UPDATE "Ticker" SET "watchlisted"=0 WHERE "symbol"=?').run(symbolUpper);
      
      db.prepare('DELETE FROM "WatchlistEntry" WHERE "symbol"=?').run(symbolUpper);
      
      db.prepare(`
        UPDATE "Candidate" 
        SET "userState"='INBOX', "computedAt"=? 
        WHERE "symbol"=?
      `).run(nowIso, symbolUpper);
    }

    revalidatePath(`/tickers/${symbolUpper}`);
    revalidatePath(`/tickers`);
    return { ok: true };
  } catch (err: any) {
    console.error("Error in toggleWatchlistAction:", err);
    return { ok: false, error: err.message || "Failed to toggle watchlist status" };
  }
}

export async function launchResearchRunAction(
  symbol: string,
  runType: string,
  budgetSeconds: number,
  profile: string
): Promise<{ ok: boolean; runId?: string; error?: string }> {
  if (!symbol) return { ok: false, error: "Symbol is required" };

  const db = await openWritableDb();
  if (!db) return { ok: false, error: "Database is not writable" };

  try {
    const symbolUpper = symbol.toUpperCase();
    
    // 1. Create research run record in PENDING state
    const runId = createResearchRun(db as any, {
      runType,
      target: symbolUpper,
      budgetSeconds,
      profile
    });

    // 2. Spawn the detached background job (which triggers `research_run --run-id=...`)
    spawnJob("research_run", [`--run-id=${runId}`], { manageLlama: true });

    revalidatePath(`/tickers/${symbolUpper}`);
    return { ok: true, runId };
  } catch (err: any) {
    console.error("Error in launchResearchRunAction:", err);
    return { ok: false, error: err.message || "Failed to launch research run" };
  }
}
