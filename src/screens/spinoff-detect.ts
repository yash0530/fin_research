import { extractItemsFromText } from "./eightk-classify";

export interface SpinoffSignal {
  kind: "spinoff-announced" | "spinoff-completed";
  parentSymbol: string;
  headline: string;
  snippet: string;
  confidence: "high" | "medium";
  recordDateHint?: string;
}

function extractRecordDate(text: string): string | undefined {
  // Look for "record date" followed by some text, and then a date format
  const regex = /record\s+date\b[\s\S]{0,100}?(?:on|of|is|as\s+of)?\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i;
  const match = text.match(regex);
  if (match) {
    return match[1].trim();
  }
  return undefined;
}

function getSpinoffSnippet(text: string, matchIndex: number): string {
  if (matchIndex < 0) return text.slice(0, 200).trim();
  const start = Math.max(0, matchIndex - 20);
  const slice = text.slice(start, start + 300).trim();
  return slice.length > 200 ? slice.slice(0, 197) + "..." : slice;
}

/** Pure 8-K spinoff classifier. */
export function detectSpinoff(
  text: string,
  explicitItems?: string[],
  parentSymbol: string = "UNKNOWN"
): SpinoffSignal | null {
  try {
    if (!text) return null;

    const items = explicitItems && explicitItems.length > 0 ? explicitItems : extractItemsFromText(text);

    const isItem201 = items.includes("2.01");
    const spinSeparationRegex = /\b(?:spin[- ]off|spinoff|separation|separate|distribute|distribution)\b/i;

    // 1. Completion: item 2.01 + spin/separation keywords
    if (isItem201) {
      const match = text.match(spinSeparationRegex);
      if (match && match.index !== undefined) {
        return {
          kind: "spinoff-completed",
          parentSymbol,
          headline: "Spin-off Completed",
          snippet: getSpinoffSnippet(text, match.index),
          confidence: "high",
          recordDateHint: extractRecordDate(text),
        };
      }
    }

    // 2. Announcement: item 1.01 + separation/distribution agreement
    const isItem101 = items.includes("1.01");
    const agreementRegex = /\b(?:separation|distribution)\s+agreement\b/i;

    if (isItem101) {
      const match = text.match(agreementRegex);
      if (match && match.index !== undefined) {
        return {
          kind: "spinoff-announced",
          parentSymbol,
          headline: "Spin-off Announced",
          snippet: getSpinoffSnippet(text, match.index),
          confidence: "high",
          recordDateHint: extractRecordDate(text),
        };
      }
    }

    // 3. Explicit keywords (medium confidence)
    const explicitRegexes = [
      /\bspin[- ]off\b/i,
      /\bspinoff\b/i,
      /\btax[- ]free\s+distribution\b/i,
      /\bform\s+10\b/i,
      /\bdistribution\s+ratio\b/i,
      /\brecord\s+date\b[\s\S]{0,300}\bdistribution\s+(?:of\s+)?shares\b/i,
      /\bdistribution\s+(?:of\s+)?shares\b[\s\S]{0,300}\brecord\s+date\b/i,
    ];

    for (const regex of explicitRegexes) {
      const match = text.match(regex);
      if (match && match.index !== undefined) {
        const kind = isItem201 ? "spinoff-completed" : "spinoff-announced";
        return {
          kind,
          parentSymbol,
          headline: kind === "spinoff-completed" ? "Spin-off Completed" : "Spin-off Announced",
          snippet: getSpinoffSnippet(text, match.index),
          confidence: "medium",
          recordDateHint: extractRecordDate(text),
        };
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}
