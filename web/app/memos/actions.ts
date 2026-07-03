"use server";

// Memo apply/reject — a human-gated write path (mirrors the sector-stage
// discipline: the engine proposes, a human applies). Thin adapters over the tested
// engine memo-store; the only mutations here are the two review actions.

import { revalidatePath } from "next/cache";
import { applyMemoVersion, rejectMemoVersion } from "@engine/dossier/memo-store";
import { openWritableDb } from "../../lib/engine-write";

export type MemoActionResult = { ok: true } | { error: string };

export async function applyMemoAction(versionId: number, symbol: string): Promise<MemoActionResult> {
  const db = await openWritableDb();
  if (!db) return { error: "engine DB unavailable" };
  const ok = applyMemoVersion(db, versionId);
  if (!ok) return { error: "version is not staged (already applied, superseded, or rejected)" };
  revalidatePath(`/memos/${symbol.toUpperCase()}`);
  revalidatePath("/memos");
  return { ok: true };
}

export async function rejectMemoAction(versionId: number, symbol: string): Promise<MemoActionResult> {
  const db = await openWritableDb();
  if (!db) return { error: "engine DB unavailable" };
  const ok = rejectMemoVersion(db, versionId);
  if (!ok) return { error: "version is not staged" };
  revalidatePath(`/memos/${symbol.toUpperCase()}`);
  revalidatePath("/memos");
  return { ok: true };
}
