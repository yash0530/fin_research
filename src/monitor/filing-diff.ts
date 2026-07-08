// Filing-diff core — PURE functions over two injected filing document texts.
// Finds the paragraphs that materially changed between a company's two most
// recent 10-K (or 10-Q) filings so the LLM only ever narrates already-detected
// changes (deterministic-synthesis-first; the anti-alert-fatigue design from the
// rebuild plan: boilerplate is filtered BEFORE anything reaches a model).
//
// Pipeline (all pure, fixture-tested):
//   1. strip HTML → split into paragraphs, tracking the current section heading
//   2. drop regex-blocklist boilerplate (safe harbor / forward-looking / ASC recitals)
//   3. align each new paragraph to its best old counterpart (same section first,
//      whole doc as fallback), Jaccard similarity on normalized token sets
//   4. near-verbatim pairs (Jaccard ≥ NEAR_VERBATIM) = shared boilerplate → dropped
//   5. changed = Jaccard < CHANGED_THRESHOLD AND the paragraph carries
//      company-specific tokens (ticker, capitalized multi-word product nouns, numbers)
//   6. return the top-3 most-changed pairs + honest counts

export const CHANGED_THRESHOLD = 0.6;
export const NEAR_VERBATIM = 0.9;
export const TOP_CHANGED = 3;

export type ChangedParagraph = {
  section: string;
  before: string;
  after: string;
  jaccard: number;
};

export type FilingDiffResult = {
  /** Paragraph counts after HTML-strip + split, before any filtering. */
  oldParagraphs: number;
  newParagraphs: number;
  /** Paragraphs dropped by the regex boilerplate blocklist (both docs). */
  boilerplateDropped: number;
  /** New-doc paragraphs that matched an old paragraph near-verbatim (unchanged). */
  unchanged: number;
  /** Total changed paragraphs found (before the top-3 cap). */
  changedCount: number;
  /** Top-3 changed pairs, most-changed (lowest Jaccard) first. */
  changed: ChangedParagraph[];
};

// Boilerplate recitals that appear in essentially every filing and never carry
// thesis-relevant change: safe-harbor language, forward-looking-statement
// disclaimers, and ASC / accounting-standard adoption recitals.
const BOILERPLATE_BLOCKLIST: RegExp[] = [
  /safe\s+harbor/i,
  /forward[-\s]looking\s+statements?/i,
  /private\s+securities\s+litigation\s+reform\s+act/i,
  /\bASC\s+\d{3}/i,
  /\bASU\s+\d{4}-\d{2}/i,
  /accounting\s+standards?\s+(update|codification|board)/i,
  /recently\s+(issued|adopted)\s+accounting\s+(pronouncements|standards)/i,
];

/** Strip HTML tags/scripts and decode the handful of entities EDGAR docs use. */
export function stripHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(p|div|br|tr|li|h[1-6]|table)[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

const SECTION_HEADING = /^\s*(item\s+\d+[a-z]?\.?|part\s+[ivx]+\b)/i;

export type SectionedParagraph = { section: string; text: string };

/** Split cleaned text into paragraphs, tagging each with its section heading. */
export function splitParagraphs(raw: string): SectionedParagraph[] {
  const cleaned = stripHtml(raw);
  const blocks = cleaned
    .split(/\n\s*\n+/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 0);

  const out: SectionedParagraph[] = [];
  let section = "(preamble)";
  for (const block of blocks) {
    const m = block.match(SECTION_HEADING);
    if (m && block.length < 160) {
      // Short heading-like block: switch section, don't emit as a paragraph.
      section = block.slice(0, 120);
      continue;
    }
    if (m) section = m[0].trim();
    if (block.length < 40) continue; // fragments — too short to diff meaningfully
    out.push({ section, text: block });
  }
  return out;
}

export function isBoilerplate(text: string): boolean {
  return BOILERPLATE_BLOCKLIST.some((re) => re.test(text));
}

const STOPWORDS = new Set([
  "the", "and", "of", "to", "in", "a", "for", "our", "we", "or", "on", "as",
  "is", "are", "that", "with", "by", "an", "be", "from", "at", "its", "this",
  "was", "were", "have", "has", "not", "may", "will", "which", "other", "such",
]);

/** Normalized token set for Jaccard comparison (lowercase, stopwords removed). */
export function tokenSet(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[a-z0-9][a-z0-9.%$-]*/g) ?? [];
  const set = new Set<string>();
  for (const t of tokens) if (!STOPWORDS.has(t)) set.add(t);
  return set;
}

/** Jaccard similarity of two token sets. Empty ∪ empty = 1 (identical nothing). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

/**
 * Company-specific token gate: a changed paragraph only counts when it mentions
 * the ticker, a number, or a capitalized multi-word sequence (product nouns) —
 * generic prose churn never fires an alert.
 */
export function hasCompanyTokens(text: string, symbol: string): boolean {
  const sym = symbol.replace(/[^A-Za-z0-9.]/g, "");
  if (sym && new RegExp(`\\b${sym}\\b`, "i").test(text)) return true;
  if (/\d/.test(text)) return true;
  // Capitalized multi-word sequence NOT at sentence start (product/entity nouns).
  if (/[a-z,;:)]\s+[A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+/.test(text)) return true;
  return false;
}

/**
 * Diff two filing texts (older first). Pure — takes raw doc text (HTML fine),
 * returns the top-3 changed paragraph pairs plus honest counts.
 */
export function diffFilings(oldText: string, newText: string, symbol: string): FilingDiffResult {
  const oldParas = splitParagraphs(oldText);
  const newParas = splitParagraphs(newText);

  let boilerplateDropped = 0;
  const oldKept = oldParas.filter((p) => {
    if (isBoilerplate(p.text)) {
      boilerplateDropped++;
      return false;
    }
    return true;
  });
  const newKept = newParas.filter((p) => {
    if (isBoilerplate(p.text)) {
      boilerplateDropped++;
      return false;
    }
    return true;
  });

  const oldTokens = oldKept.map((p) => ({ ...p, tokens: tokenSet(p.text) }));

  let unchanged = 0;
  const changedAll: ChangedParagraph[] = [];

  for (const np of newKept) {
    const nTokens = tokenSet(np.text);
    // Align by section heading first; fall back to the whole old doc.
    const sectionPool = oldTokens.filter((op) => op.section === np.section);
    const pool = sectionPool.length > 0 ? sectionPool : oldTokens;

    let best: { text: string; j: number } | null = null;
    for (const op of pool) {
      const j = jaccard(nTokens, op.tokens);
      if (best === null || j > best.j) best = { text: op.text, j };
    }
    if (best === null) {
      // Old doc empty — everything new is a change (subject to the token gate).
      if (hasCompanyTokens(np.text, symbol)) {
        changedAll.push({ section: np.section, before: "", after: np.text, jaccard: 0 });
      }
      continue;
    }
    if (best.j >= NEAR_VERBATIM) {
      unchanged++; // shared boilerplate / carried-over paragraph
      continue;
    }
    if (best.j < CHANGED_THRESHOLD && hasCompanyTokens(np.text, symbol)) {
      changedAll.push({
        section: np.section,
        before: best.text,
        after: np.text,
        jaccard: Math.round(best.j * 1000) / 1000,
      });
    }
  }

  changedAll.sort((a, b) => a.jaccard - b.jaccard);

  return {
    oldParagraphs: oldParas.length,
    newParagraphs: newParas.length,
    boilerplateDropped,
    unchanged,
    changedCount: changedAll.length,
    changed: changedAll.slice(0, TOP_CHANGED),
  };
}
