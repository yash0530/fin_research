import { z } from "zod";
import { jsonsafe } from "../analyst/jsonsafe";
import { LEVELS, SENTIMENTS, CYCLE_STAGES, VERDICT_STANCES } from "./enums";

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

/** The full OUTPUT_FORMAT contract appended to every rendered prompt. Faithful port
 *  of ResearchApp/lib/seed-prompts.ts — a readable report first, then exactly one
 *  fenced `json` block with up to 10 arrays, enum vocab, 1–5 confidence, the mandatory
 *  discoveries rule, and a shape-only example. Parsed by `parseResearchOutput`. */
export const OUTPUT_FORMAT = `## How to format your answer

Write a clear, skeptical, sourced research report for a human first, USING MARKDOWN TABLES wherever you compare multiple things (tickers, verdicts, targets, risks). Suggested sections (include the ones that apply): Summary, Tickers, Verdicts, Catalysts, Risks, Analyst Targets, Theme Read, Watch List, Open Questions. Be specific, cite dates for events/target changes/earnings, separate proven numbers from narrative, and include disconfirming evidence.

Then, at the VERY END, output exactly ONE fenced code block tagged \`json\` that encodes the same findings as structured data. Nothing after it.

Rules for the JSON block:
- Use only these arrays (omit any that are empty): themes, tickers, claims, risks, catalysts, targets, watch, verdicts, discoveries, questions.
- Enum values are case-insensitive. cycle = dormant|emerging|heating_up|crowded|rolling_over; crowding/importance/severity = low|medium|high; sentiment = bullish|neutral|bearish|mixed; stance = research_now|watch|defer|avoid.
- confidence and priority are integers 1-5. Numbers (target, previous_target) are plain numbers, no $ or commas. Dates are YYYY-MM-DD.
- For ANY ticker you mention that is NOT in my selected ticker list above, you MUST add an entry to discoveries — this is how my tracked universe grows, so do not skip it.
- The JSON below shows SHAPE ONLY. Replace every value with your real findings; do not echo the example numbers, tickers, or firms.

Example (shape only — replace with your real findings):
\`\`\`json
{
  "themes": [{"theme":"ai_memory","cycle":"heating_up","crowding":"high","confidence":4,"summary":"HBM tightness"}],
  "tickers": [{"ticker":"MU","theme":"ai_memory","sentiment":"bullish","confidence":4,"role":"HBM beneficiary"}],
  "claims": [{"text":"HBM demand is supply constrained","ticker":"MU","theme":"ai_memory","confidence":4,"importance":"high"}],
  "risks": [{"text":"DRAM pricing rolls over","ticker":"MU","theme":"ai_memory","severity":"high","timeframe":"next_quarter"}],
  "catalysts": [{"text":"Guidance raised","ticker":"MU","theme":"ai_memory","importance":"medium","timeframe":"next_quarter"}],
  "targets": [{"ticker":"MU","firm":"UBS","rating":"buy","target":155,"previous_target":140,"date":"2026-05-20"}],
  "watch": [{"text":"Gross margin guide","ticker":"MU","theme":"ai_memory","timeframe":"next_2_quarters"}],
  "verdicts": [{"ticker":"MU","theme":"ai_memory","stance":"RESEARCH_NOW","priority":4,"horizon":"next_12_months","rationale":"Structural demand driver."}],
  "discoveries": [{"ticker":"ALAB","company":"Astera Labs","theme":"ai_networking","reason":"connectivity exposure"}],
  "questions": [{"text":"Too dependent on one hyperscaler capex cycle?","ticker":"MU","theme":"ai_memory"}]
}
\`\`\``;

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

// ── Structured research-output parser (full OUTPUT_FORMAT contract) ───────────
//
// Faithful port of ResearchApp/lib/parser.ts. `parseResearchOutput` handles the
// contract embedded in OUTPUT_FORMAT above: a readable report ending in one fenced
// `json` block with 10 named arrays. It falls back to the legacy pipe-delimited
// SIGNAL_DESK block for old saved captures. Output is a typed ParsedSignalBlock —
// richer than the flat CaptureItem[] `parseCapture` returns, preserving per-item
// fields (target numbers, stance, severity, discovery company, …). Never throws;
// malformed rows/objects are collected in `ignoredLines`.

export type ParsedSignalBlock = {
  claims: ParsedClaimInput[];
  risks: ParsedRiskInput[];
  catalysts: ParsedCatalystInput[];
  tickerMentions: ParsedTickerMentionInput[];
  analystTargets: ParsedAnalystTargetInput[];
  themeSignals: ParsedThemeSignalInput[];
  watchItems: ParsedWatchItemInput[];
  verdicts: ParsedVerdictInput[];
  discoveries: ParsedDiscoveryInput[];
  questions: ParsedQuestionInput[];
  lineCount: number;
  ignoredLines: string[];
};

export type ParsedClaimInput = {
  text: string;
  ticker?: string;
  themeSlug?: string;
  confidence?: number;
  importance?: "LOW" | "MEDIUM" | "HIGH";
  sourceUrl?: string;
};
export type ParsedRiskInput = {
  text: string;
  ticker?: string;
  themeSlug?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
  timeframe?: string;
  sourceUrl?: string;
};
export type ParsedCatalystInput = {
  text: string;
  ticker?: string;
  themeSlug?: string;
  importance?: "LOW" | "MEDIUM" | "HIGH";
  timeframe?: string;
  sourceUrl?: string;
};
export type ParsedTickerMentionInput = {
  ticker: string;
  themeSlug?: string;
  sentiment?: "BULLISH" | "NEUTRAL" | "BEARISH" | "MIXED";
  confidence?: number;
  role?: string;
};
export type ParsedAnalystTargetInput = {
  ticker: string;
  firm?: string;
  rating?: string;
  target?: number;
  previousTarget?: number;
  date?: Date;
  sourceUrl?: string;
};
export type ParsedThemeSignalInput = {
  themeSlug: string;
  cycle?: "DORMANT" | "EMERGING" | "HEATING_UP" | "CROWDED" | "ROLLING_OVER";
  crowding?: "LOW" | "MEDIUM" | "HIGH";
  confidence?: number;
  summary?: string;
};
export type ParsedWatchItemInput = { text: string; ticker?: string; themeSlug?: string; timeframe?: string };
export type ParsedVerdictInput = {
  ticker?: string;
  themeSlug?: string;
  stance: "RESEARCH_NOW" | "WATCH" | "DEFER" | "AVOID";
  priority?: number;
  horizon?: string;
  rationale: string;
};
export type ParsedDiscoveryInput = {
  symbol: string;
  companyName?: string;
  suggestedTheme?: string;
  reason?: string;
  sourceLine: string;
};
export type ParsedQuestionInput = { text: string; ticker?: string; themeSlug?: string };

type KeyValues = Record<string, string>;

const BLOCK_RE = /SIGNAL_DESK_DATA_START([\s\S]*?)SIGNAL_DESK_DATA_END/i;

function emptyBlock(): ParsedSignalBlock {
  return {
    claims: [], risks: [], catalysts: [], tickerMentions: [], analystTargets: [],
    themeSignals: [], watchItems: [], verdicts: [], discoveries: [], questions: [],
    lineCount: 0, ignoredLines: [],
  };
}

/** Legacy pipe-delimited block: SIGNAL_DESK_DATA_START … TYPE|key=value … END. */
export function parseSignalDeskBlock(rawOutput: string): ParsedSignalBlock {
  const block = emptyBlock();
  const match = rawOutput.match(BLOCK_RE);
  if (!match?.[1]) return block;

  const lines = match[1].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    block.lineCount += 1;
    const [typeRaw, ...segments] = line.split("|");
    const type = typeRaw?.trim().toUpperCase();
    const fields = parseFields(segments);
    try {
      switch (type) {
        case "THEME": {
          const themeSlug = cleanTheme(fields.theme);
          if (!themeSlug) throw new Error("missing theme");
          block.themeSignals.push({
            themeSlug, cycle: normalizeCycle(fields.cycle), crowding: normalizeLevel(fields.crowding),
            confidence: normalizeConfidence(fields.confidence), summary: clean(fields.summary),
          });
          break;
        }
        case "TICKER": {
          const ticker = cleanTicker(fields.ticker || fields.symbol);
          if (!ticker) throw new Error("missing ticker");
          block.tickerMentions.push({
            ticker, themeSlug: cleanTheme(fields.theme), sentiment: normalizeSentiment(fields.sentiment),
            confidence: normalizeConfidence(fields.confidence), role: clean(fields.role),
          });
          break;
        }
        case "CLAIM": {
          const text = clean(fields.text);
          if (!text) throw new Error("missing text");
          block.claims.push({
            text, ticker: cleanTicker(fields.ticker), themeSlug: cleanTheme(fields.theme),
            confidence: normalizeConfidence(fields.confidence), importance: normalizeLevel(fields.importance),
            sourceUrl: clean(fields.source_url || fields.sourceUrl),
          });
          break;
        }
        case "RISK": {
          const text = clean(fields.text);
          if (!text) throw new Error("missing text");
          block.risks.push({
            text, ticker: cleanTicker(fields.ticker), themeSlug: cleanTheme(fields.theme),
            severity: normalizeLevel(fields.severity), timeframe: clean(fields.timeframe),
            sourceUrl: clean(fields.source_url || fields.sourceUrl),
          });
          break;
        }
        case "CATALYST": {
          const text = clean(fields.text);
          if (!text) throw new Error("missing text");
          block.catalysts.push({
            text, ticker: cleanTicker(fields.ticker), themeSlug: cleanTheme(fields.theme),
            importance: normalizeLevel(fields.importance), timeframe: clean(fields.timeframe),
            sourceUrl: clean(fields.source_url || fields.sourceUrl),
          });
          break;
        }
        case "TARGET": {
          const ticker = cleanTicker(fields.ticker || fields.symbol);
          if (!ticker) throw new Error("missing ticker");
          block.analystTargets.push({
            ticker, firm: clean(fields.firm), rating: clean(fields.rating), target: normalizeNumber(fields.target),
            previousTarget: normalizeNumber(fields.previous_target || fields.previousTarget),
            date: normalizeDate(fields.date), sourceUrl: clean(fields.source_url || fields.sourceUrl),
          });
          break;
        }
        case "WATCH": {
          const text = clean(fields.text || fields.metric);
          if (!text) throw new Error("missing text");
          block.watchItems.push({
            text, ticker: cleanTicker(fields.ticker), themeSlug: cleanTheme(fields.theme), timeframe: clean(fields.timeframe),
          });
          break;
        }
        case "VERDICT": {
          const stance = normalizeVerdictStance(fields.stance);
          const rationale = clean(fields.rationale || fields.reason);
          if (!stance) throw new Error("missing stance");
          if (!rationale) throw new Error("missing rationale");
          block.verdicts.push({
            ticker: cleanTicker(fields.ticker), themeSlug: cleanTheme(fields.theme), stance,
            priority: normalizeConfidence(fields.priority), horizon: clean(fields.horizon), rationale,
          });
          break;
        }
        case "DISCOVERY_TICKER": {
          const symbol = cleanTicker(fields.ticker || fields.symbol);
          if (!symbol) throw new Error("missing ticker");
          block.discoveries.push({
            symbol, companyName: clean(fields.company || fields.company_name || fields.name),
            suggestedTheme: cleanTheme(fields.theme), reason: clean(fields.reason), sourceLine: line,
          });
          break;
        }
        case "QUESTION": {
          const text = clean(fields.text);
          if (!text) throw new Error("missing text");
          block.questions.push({ text, ticker: cleanTicker(fields.ticker), themeSlug: cleanTheme(fields.theme) });
          break;
        }
        default:
          block.ignoredLines.push(line);
      }
    } catch {
      block.ignoredLines.push(line);
    }
  }
  return block;
}

function parseFields(segments: string[]): KeyValues {
  const out: KeyValues = {};
  for (const segment of segments) {
    const idx = segment.indexOf("=");
    if (idx <= 0) continue;
    const key = segment.slice(0, idx).trim();
    const value = segment.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function clean(value?: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return undefined;
}

export function cleanTicker(value?: unknown): string | undefined {
  let str: string | undefined;
  if (typeof value === "string") str = value;
  else if (typeof value === "number" && Number.isFinite(value)) str = String(value);
  const cleaned = str?.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  if (!cleaned || cleaned.length > 8) return undefined;
  return cleaned;
}

function cleanTheme(value?: unknown): string | undefined {
  let str: string | undefined;
  if (typeof value === "string") str = value;
  else if (typeof value === "number" && Number.isFinite(value)) str = String(value);
  const cleaned = str?.trim().toLowerCase().replace(/[^a-z0-9_/-]/g, "_").replace(/-/g, "_");
  return cleaned || undefined;
}

function normalizeConfidence(value?: unknown): number | undefined {
  if (value === null || value === undefined || typeof value === "boolean" || Array.isArray(value)) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function normalizeNumber(value?: unknown): number | undefined {
  if (value === undefined || value === null || typeof value === "boolean" || Array.isArray(value)) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const str = String(value).trim();
  if (!str) return undefined;
  const n = Number(str.replace(/[$,%]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function normalizeDate(value?: unknown): Date | undefined {
  if (!value || typeof value === "boolean" || Array.isArray(value)) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === "object") return undefined;
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeLevel(value?: unknown): "LOW" | "MEDIUM" | "HIGH" | undefined {
  if (typeof value !== "string") return undefined;
  const level = value.trim().toUpperCase();
  return LEVELS.includes(level as (typeof LEVELS)[number]) ? (level as "LOW" | "MEDIUM" | "HIGH") : undefined;
}

function normalizeSentiment(value?: unknown): "BULLISH" | "NEUTRAL" | "BEARISH" | "MIXED" | undefined {
  if (typeof value !== "string") return undefined;
  const sentiment = value.trim().toUpperCase();
  return SENTIMENTS.includes(sentiment as (typeof SENTIMENTS)[number])
    ? (sentiment as "BULLISH" | "NEUTRAL" | "BEARISH" | "MIXED")
    : undefined;
}

function normalizeCycle(value?: unknown): "DORMANT" | "EMERGING" | "HEATING_UP" | "CROWDED" | "ROLLING_OVER" | undefined {
  if (typeof value !== "string") return undefined;
  const cycle = value.trim().toUpperCase();
  return CYCLE_STAGES.includes(cycle as (typeof CYCLE_STAGES)[number])
    ? (cycle as "DORMANT" | "EMERGING" | "HEATING_UP" | "CROWDED" | "ROLLING_OVER")
    : undefined;
}

function normalizeVerdictStance(value?: unknown): "RESEARCH_NOW" | "WATCH" | "DEFER" | "AVOID" | undefined {
  if (typeof value !== "string") return undefined;
  const stance = value.trim().toUpperCase();
  return VERDICT_STANCES.includes(stance as (typeof VERDICT_STANCES)[number])
    ? (stance as "RESEARCH_NOW" | "WATCH" | "DEFER" | "AVOID")
    : undefined;
}

// ── JSON-block parsing (primary format) ──────────────────────────────────────

const JSON_FENCE_RE = /```(?:json|signal)?\s*([\s\S]*?)```/gi;

/** Extract the LAST fenced code block that parses as a JSON object. */
function extractJsonBlock(raw: string): Record<string, unknown> | { __parseError: true } | null {
  let match: RegExpExecArray | null;
  let last: string | null = null;
  JSON_FENCE_RE.lastIndex = 0;
  while ((match = JSON_FENCE_RE.exec(raw)) !== null) {
    const body = match[1].trim();
    if (body.startsWith("{")) last = body;
  }
  if (!last) {
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s >= 0 && e > s) last = raw.slice(s, e + 1);
  }
  if (!last) return null;
  try {
    return JSON.parse(last) as Record<string, unknown>;
  } catch {
    return { __parseError: true };
  }
}

const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

/**
 * Parse the model's JSON object into a ParsedSignalBlock. Returns null ONLY when
 * there is no JSON block at all (so the caller can fall back to the legacy parser).
 */
export function parseSignalJson(rawOutput: string): ParsedSignalBlock | null {
  const obj = extractJsonBlock(rawOutput);
  if (obj === null) return null;

  const block = emptyBlock();
  if ((obj as { __parseError?: boolean }).__parseError) {
    block.ignoredLines.push("Found a ```json block but it failed to parse as JSON.");
    return block;
  }
  const o = obj as Record<string, unknown>;

  const push = (raw: unknown, ok: boolean, target: unknown[], item: unknown) => {
    block.lineCount += 1;
    if (ok) target.push(item);
    else block.ignoredLines.push(JSON.stringify(raw));
  };

  for (const t of asArray(o.themes ?? o.themeSignals)) {
    const themeSlug = cleanTheme(t.theme ?? t.themeSlug);
    push(t, !!themeSlug, block.themeSignals, {
      themeSlug, cycle: normalizeCycle(t.cycle), crowding: normalizeLevel(t.crowding),
      confidence: normalizeConfidence(t.confidence), summary: clean(t.summary),
    });
  }
  for (const t of asArray(o.tickers ?? o.tickerMentions)) {
    const ticker = cleanTicker(t.ticker ?? t.symbol);
    push(t, !!ticker, block.tickerMentions, {
      ticker, themeSlug: cleanTheme(t.theme), sentiment: normalizeSentiment(t.sentiment),
      confidence: normalizeConfidence(t.confidence), role: clean(t.role),
    });
  }
  for (const c of asArray(o.claims)) {
    const text = clean(c.text);
    push(c, !!text, block.claims, {
      text, ticker: cleanTicker(c.ticker), themeSlug: cleanTheme(c.theme),
      confidence: normalizeConfidence(c.confidence), importance: normalizeLevel(c.importance),
      sourceUrl: clean(c.source_url ?? c.sourceUrl),
    });
  }
  for (const r of asArray(o.risks)) {
    const text = clean(r.text);
    push(r, !!text, block.risks, {
      text, ticker: cleanTicker(r.ticker), themeSlug: cleanTheme(r.theme),
      severity: normalizeLevel(r.severity), timeframe: clean(r.timeframe),
      sourceUrl: clean(r.source_url ?? r.sourceUrl),
    });
  }
  for (const c of asArray(o.catalysts)) {
    const text = clean(c.text);
    push(c, !!text, block.catalysts, {
      text, ticker: cleanTicker(c.ticker), themeSlug: cleanTheme(c.theme),
      importance: normalizeLevel(c.importance), timeframe: clean(c.timeframe),
      sourceUrl: clean(c.source_url ?? c.sourceUrl),
    });
  }
  for (const t of asArray(o.targets ?? o.analystTargets)) {
    const ticker = cleanTicker(t.ticker ?? t.symbol);
    push(t, !!ticker, block.analystTargets, {
      ticker, firm: clean(t.firm), rating: clean(t.rating), target: normalizeNumber(t.target),
      previousTarget: normalizeNumber(t.previous_target ?? t.previousTarget),
      date: normalizeDate(t.date), sourceUrl: clean(t.source_url ?? t.sourceUrl),
    });
  }
  for (const w of asArray(o.watch ?? o.watchItems)) {
    const text = clean(w.text ?? w.metric);
    push(w, !!text, block.watchItems, {
      text, ticker: cleanTicker(w.ticker), themeSlug: cleanTheme(w.theme), timeframe: clean(w.timeframe),
    });
  }
  for (const v of asArray(o.verdicts)) {
    const stance = normalizeVerdictStance(v.stance);
    const rationale = clean(v.rationale ?? v.reason);
    push(v, !!stance && !!rationale, block.verdicts, {
      ticker: cleanTicker(v.ticker), themeSlug: cleanTheme(v.theme), stance: stance!,
      priority: normalizeConfidence(v.priority), horizon: clean(v.horizon), rationale: rationale!,
    });
  }
  for (const d of asArray(o.discoveries)) {
    const symbol = cleanTicker(d.ticker ?? d.symbol);
    push(d, !!symbol, block.discoveries, {
      symbol: symbol!, companyName: clean(d.company ?? d.company_name ?? d.name),
      suggestedTheme: cleanTheme(d.theme), reason: clean(d.reason), sourceLine: `DISCOVERY ${symbol} (json)`,
    });
  }
  for (const q of asArray(o.questions)) {
    const text = clean(q.text);
    push(q, !!text, block.questions, { text, ticker: cleanTicker(q.ticker), themeSlug: cleanTheme(q.theme) });
  }
  return block;
}

/**
 * Top-level entry: try the JSON block first; if there is NO json block at all, fall
 * back to the legacy SIGNAL_DESK pipe parser (for old saved captures).
 */
export function parseResearchOutput(rawOutput: string): ParsedSignalBlock {
  const json = parseSignalJson(rawOutput);
  if (json) return json;
  return parseSignalDeskBlock(rawOutput);
}
