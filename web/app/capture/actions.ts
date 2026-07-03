"use server";

// Capture flow server actions — the web app's first (and only) write path.
// All logic lives in the tested engine (@engine/capture/*); these actions are
// thin adapters: open a writable DB, call the engine, return plain JSON.

import { revalidatePath } from "next/cache";
import { renderPrompt, type PromptTemplate, type RenderContext } from "@engine/capture/render";
import { parseCapture, type CaptureItem } from "@engine/capture/parse";
import { insertCapture, setCaptureOutput, commitCapture, type CommitSummary } from "@engine/capture/commit";
import { openWritableDb } from "../../lib/engine-write";

export type RenderResult = { captureId: number; prompt: string } | { error: string };
export type ParseResult = { items: CaptureItem[]; parseStatus: string } | { error: string };
export type CommitResult = (CommitSummary & { ok: true }) | { error: string };

const TEMPLATES: PromptTemplate[] = ["daily_scan", "theme_deep_dive", "ticker_check", "discovery_sweep"];

function watchlist(db: NonNullable<Awaited<ReturnType<typeof openWritableDb>>>): string[] {
  try {
    const rows = db
      .prepare(`SELECT symbol FROM Ticker WHERE watchlisted = 1 AND active = 1 ORDER BY symbol LIMIT 40`)
      .all() as { symbol: string }[];
    return rows.map((r) => r.symbol);
  } catch {
    return [];
  }
}

export async function renderCaptureAction(
  template: string,
  ticker?: string,
  focus?: string,
): Promise<RenderResult> {
  if (!TEMPLATES.includes(template as PromptTemplate)) return { error: `unknown template: ${template}` };
  const db = await openWritableDb();
  if (!db) return { error: "engine DB unavailable — run npm run seed from the repo root" };
  const ctx: RenderContext = {
    asOf: new Date().toISOString().slice(0, 10),
    watchlist: watchlist(db),
    ...(ticker?.trim() ? { ticker: ticker.trim().toUpperCase() } : {}),
    ...(focus?.trim() ? { focus: focus.trim() } : {}),
  };
  const prompt = renderPrompt(template as PromptTemplate, ctx);
  const captureId = insertCapture(db, template, prompt);
  return { captureId, prompt };
}

export async function parseCaptureAction(captureId: number, raw: string): Promise<ParseResult> {
  if (!raw.trim()) return { error: "paste the assistant's reply first" };
  const db = await openWritableDb();
  if (!db) return { error: "engine DB unavailable" };
  const { items, parseStatus } = parseCapture(raw);
  setCaptureOutput(db, captureId, raw, parseStatus);
  return { items, parseStatus };
}

export async function commitCaptureAction(captureId: number, items: CaptureItem[]): Promise<CommitResult> {
  const db = await openWritableDb();
  if (!db) return { error: "engine DB unavailable" };
  const summary = commitCapture(db, captureId, items);
  revalidatePath("/");
  revalidatePath("/tickers");
  return { ok: true, ...summary };
}
