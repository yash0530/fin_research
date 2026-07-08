"use server";

import { revalidatePath } from "next/cache";
import { openWritableDb } from "../../lib/engine-write";
import { upsertPosition, deletePosition } from "@engine/db/queries";
import { previewBuyList, type SizedItem } from "../../lib/buy-ceremony-data";
import { settings } from "@engine/config/settings";

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

// ── Buy ceremony (4-step wizard) ──────────────────────────────────────────────
// Step 2 (governor sizing): recompute LIVE via src/calibration/governor.ts +
// src/buylist/build.ts. Step 4 (commit): writes BuyList/BuyListItem +
// JournalEntry + DecisionSnapshot per item. NO broker/order code — plain rows
// the user logs actual manual buys against.

export type PreviewResult = { ok: true; capitalUsd: number; deployedUsd: number; cashUsd: number; items: SizedItem[] } | { ok: false; error: string };

/** Step 2: live governor sizing + capital allocation over the selected symbols. */
export async function previewBuyListAction(selectedSymbols: string[]): Promise<PreviewResult> {
  if (!selectedSymbols || selectedSymbols.length === 0) {
    return { ok: false, error: "Select at least one candidate to size." };
  }
  try {
    const preview = await previewBuyList(selectedSymbols);
    return { ok: true, ...preview };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to compute governor sizing" };
  }
}

export type CommitResult = { ok: boolean; error?: string; month?: string };

/** Step 4: finalize the ceremony — BuyList/BuyListItem + a JournalEntry + DecisionSnapshot per item. */
export async function commitBuyCeremonyAction(items: SizedItem[], inversionNotes: string): Promise<CommitResult> {
  if (!items || items.length === 0) {
    return { ok: false, error: "No items to commit." };
  }
  const db = await openWritableDb();
  if (!db) return { ok: false, error: "Database is not writable" };

  try {
    const month = new Date().toISOString().slice(0, 7);
    const nowIso = new Date().toISOString();

    db.exec("BEGIN");
    try {
      db.prepare(
        'INSERT INTO "BuyList" ("month","status","capitalUsd","createdAt") VALUES (?,\'final\',?,?) ' +
          'ON CONFLICT("month") DO UPDATE SET status=\'final\', capitalUsd=excluded.capitalUsd',
      ).run(month, settings.buylist.capitalUsd, nowIso);

      // BuyListItem rows are additive per ceremony run; clear this month's prior draft rows first.
      db.prepare('DELETE FROM "BuyListItem" WHERE "buyListMonth"=?').run(month);

      for (const item of items) {
        db.prepare(
          'INSERT INTO "BuyListItem" ("buyListMonth","rank","dossierId","symbol","plannedUsd","governedSizePct","governorReason","skipped") ' +
            "VALUES (?,?,?,?,?,?,?,?)",
        ).run(
          month,
          item.rank,
          item.dossierId || null,
          item.symbol,
          item.plannedUsd,
          item.governedSizePct,
          item.governorReason || null,
          item.skipped ? 1 : 0,
        );

        if (!item.skipped) {
          const thesis = `Monthly buy ceremony (${month}): rank #${item.rank}, ${item.conviction} conviction, governed ${item.governedSizePct}% → $${item.plannedUsd} planned${item.shares !== null ? ` (~${item.shares} sh @ $${item.close?.toFixed(2)})` : ""}.`;
          db.prepare(
            'INSERT INTO "JournalEntry" ("symbol","action","thesis","invalidation","createdAt") VALUES (?,\'BUY\',?,?,?)',
          ).run(item.symbol, thesis, inversionNotes || null, nowIso);

          db.prepare('INSERT INTO "DecisionSnapshot" ("symbol","createdAt","payload") VALUES (?,?,?)').run(
            item.symbol,
            nowIso,
            JSON.stringify({ ceremony: month, ...item, inversionNotes }),
          );
        }
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }

    revalidatePath("/portfolio");
    revalidatePath("/journal");
    return { ok: true, month };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to commit buy ceremony" };
  }
}
