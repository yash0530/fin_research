"use server";
// Journal editor server action: creates a new JournalEntry + its frozen
// DecisionSnapshot in the same write (matched by symbol + exact createdAt so the
// journal-data.ts reader can pair them back up). Historical entries are
// intentionally immutable — the journal is a log, not a mutable record; logging a
// correction is itself a new entry.

import { revalidatePath } from "next/cache";
import { openWritableDb } from "@/lib/engine-write";

export type JournalResult = { ok: boolean; error?: string };

const VALID_ACTIONS = new Set(["BUY", "HOLD", "TRIM", "AVOID", "SELL", "NOTE"]);

export async function createJournalEntryAction(
  symbol: string,
  action: string,
  thesis: string,
  invalidation: string,
): Promise<JournalResult> {
  const symbolUpper = symbol.trim().toUpperCase();
  if (!symbolUpper) return { ok: false, error: "Symbol is required" };
  if (!thesis.trim()) return { ok: false, error: "Thesis is required" };
  const actionUpper = action.trim().toUpperCase();
  if (!VALID_ACTIONS.has(actionUpper)) return { ok: false, error: `Action must be one of ${Array.from(VALID_ACTIONS).join(", ")}` };

  const db = await openWritableDb();
  if (!db) return { ok: false, error: "Database is not writable" };

  try {
    const nowIso = new Date().toISOString();
    let priceAtEntry: number | null = null;
    try {
      const row = db.prepare('SELECT "close" FROM "Price" WHERE "symbol"=? ORDER BY "d" DESC LIMIT 1').get(symbolUpper) as
        | { close: number }
        | undefined;
      priceAtEntry = row?.close ?? null;
    } catch {
      /* best-effort */
    }

    db.prepare('INSERT INTO "JournalEntry" ("symbol","action","thesis","invalidation","createdAt") VALUES (?,?,?,?,?)').run(
      symbolUpper,
      actionUpper,
      thesis.trim(),
      invalidation.trim() || null,
      nowIso,
    );
    db.prepare('INSERT INTO "DecisionSnapshot" ("symbol","createdAt","payload") VALUES (?,?,?)').run(
      symbolUpper,
      nowIso,
      JSON.stringify({ symbol: symbolUpper, action: actionUpper, thesis: thesis.trim(), invalidation: invalidation.trim() || null, priceAtEntry, source: "journal-editor" }),
    );

    revalidatePath("/journal");
    revalidatePath("/portfolio");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to save journal entry" };
  }
}
