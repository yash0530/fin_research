"use server";

import { revalidatePath } from "next/cache";
import { parseCapture } from "@engine/capture/parse";
import { insertCapture, setCaptureOutput, commitCapture } from "@engine/capture/commit";
import { openWritableDb } from "../lib/engine-write";

export async function parseAndSaveAction(raw: string) {
  if (!raw.trim()) {
    return { error: "Pasted content cannot be empty." };
  }

  const db = await openWritableDb();
  if (!db) {
    return { error: "Engine DB unavailable — run npm run seed from the repo root" };
  }

  try {
    // 1. Insert capture placeholder
    const captureId = insertCapture(db, "daily_scan", "Captured via Global Drawer");

    // 2. Parse the assistant's reply
    const { items, parseStatus } = parseCapture(raw);

    // 3. Save the raw assistant output and parsing status
    setCaptureOutput(db, captureId, raw, parseStatus);

    // 4. Commit all parsed items immediately
    if (items.length > 0) {
      const summary = commitCapture(db, captureId, items);
      revalidatePath("/");
      revalidatePath("/tickers");
      return {
        ok: true,
        captureId,
        parseStatus,
        itemsCount: items.length,
        summary: `${summary.evidence} evidence item(s) · ${summary.discoveries} discovery candidate(s) · ${summary.catalysts} catalyst(s)`,
      };
    } else {
      return {
        ok: true,
        captureId,
        parseStatus,
        itemsCount: 0,
        summary: "No valid items parsed. Ensure you paste the assistant's output with valid JSON format.",
      };
    }
  } catch (err: any) {
    console.error("Error in parseAndSaveAction server action:", err);
    return { error: err.message ?? "Parsing or database write failed." };
  }
}
