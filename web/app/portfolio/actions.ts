"use server";

import { revalidatePath } from "next/cache";
import { openWritableDb } from "../../lib/engine-write";
import { upsertPosition, deletePosition } from "@engine/db/queries";

export async function addOrUpdatePositionAction(
  symbol: string,
  qty: number,
  avgCost: number,
  openedAt?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!symbol || !symbol.trim()) {
    return { ok: false, error: "Symbol is required" };
  }
  if (qty <= 0) {
    return { ok: false, error: "Quantity must be greater than 0" };
  }
  if (avgCost <= 0) {
    return { ok: false, error: "Average cost must be greater than 0" };
  }

  const db = await openWritableDb();
  if (!db) {
    return { ok: false, error: "Database unavailable — run npm run seed from root" };
  }

  try {
    upsertPosition(db, {
      symbol: symbol.trim().toUpperCase(),
      qty,
      avgCost,
      openedAt: openedAt?.trim() || new Date().toISOString().slice(0, 10),
    });
    revalidatePath("/portfolio");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to save position" };
  }
}

export async function removePositionAction(
  symbol: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!symbol || !symbol.trim()) {
    return { ok: false, error: "Symbol is required" };
  }

  const db = await openWritableDb();
  if (!db) {
    return { ok: false, error: "Database unavailable" };
  }

  try {
    deletePosition(db, symbol.trim().toUpperCase());
    revalidatePath("/portfolio");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to remove position" };
  }
}
