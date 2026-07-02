import { z } from "zod";
import { jsonsafe } from "../analyst/jsonsafe";

// Paste-capture parser. The user copies a rendered prompt into Perplexity/Claude/
// ChatGPT and pastes the answer back. We parse a strict JSON contract, with a
// forgiving legacy line-based fallback. Port of ResearchApp/lib/parser.ts.

export const CAPTURE_KINDS = [
  "claim",
  "risk",
  "catalyst",
  "target",
  "verdict",
  "theme_signal",
  "watch",
  "question",
  "ticker_mention",
] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const CaptureItemSchema = z.object({
  kind: z.enum(CAPTURE_KINDS),
  ticker: z.string().optional(),
  text: z.string(),
  source: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  asOf: z.string().optional(),
});
export type CaptureItem = z.infer<typeof CaptureItemSchema>;

export const CaptureContractSchema = z.object({
  items: z.array(CaptureItemSchema).default([]),
});

export type ParseStatus = "json" | "legacy" | "empty";
export type ParseResult = { items: CaptureItem[]; parseStatus: ParseStatus };

const TICKER_RE = /\$([A-Z]{1,5})\b/;
const TAGGED_RE = /^[-*]\s*\[(\w+)\]\s*(.+)$/;

/** The OUTPUT_FORMAT contract we ask the external model to follow. */
export const OUTPUT_FORMAT = `Return ONLY JSON: {"items":[{"kind","ticker?","text","source?","confidence?","asOf?"}]}. kind ∈ ${CAPTURE_KINDS.join("|")}.`;

export function parseCapture(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { items: [], parseStatus: "empty" };

  // 1) Strict JSON contract (salvaged from prose/fences by jsonsafe).
  const parsed = jsonsafe(trimmed);
  if (parsed && typeof parsed === "object") {
    const res = CaptureContractSchema.safeParse(parsed);
    if (res.success && res.data.items.length > 0) {
      return { items: res.data.items, parseStatus: "json" };
    }
  }

  // 2) Legacy fallback: line-based.
  const items: CaptureItem[] = [];
  for (const line of trimmed.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    const tagged = TAGGED_RE.exec(l);
    if (tagged) {
      const kind = (CAPTURE_KINDS as readonly string[]).includes(tagged[1])
        ? (tagged[1] as CaptureKind)
        : "claim";
      const ticker = TICKER_RE.exec(tagged[2])?.[1];
      items.push({ kind, text: tagged[2].trim(), ...(ticker ? { ticker } : {}) });
      continue;
    }
    const tickerMatch = TICKER_RE.exec(l);
    if (tickerMatch) {
      items.push({ kind: "ticker_mention", ticker: tickerMatch[1], text: l });
    } else if (l.startsWith("- ") || l.startsWith("* ")) {
      items.push({ kind: "claim", text: l.slice(2).trim() });
    }
  }
  return { items, parseStatus: items.length > 0 ? "legacy" : "empty" };
}
