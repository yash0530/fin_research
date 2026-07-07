export type Classified8kEvent = {
  item: string;
  kind: string;
  headline: string;
  severity: string;
  snippet: string;
};

// Guidance direction regexes
const GUIDANCE_UP_REGEX = /guidance\s+(?:is\s+|was\s+)?(?:raised|increased|lifted)|(?:raise|raising|raised|increase|increasing|increased|lift|lifting|lifts)\s+(?:its\s+)?(?:full-year\s+|full\s+year\s+)?guidance/i;
const GUIDANCE_DOWN_REGEX = /guidance\s+(?:is\s+|was\s+)?(?:lowered|decreased|withdrawn|suspended)|(?:lower|lowering|lowered|decrease|decreasing|decreased|withdraw|withdrawn|withdrawing|suspend|suspending|suspended)\s+(?:its\s+)?(?:full-year\s+|full\s+year\s+)?guidance/i;

export function extractItemsFromText(text: string): string[] {
  const regex = /item\s+([1-9]\.[0-9]{2})/gi;
  const items = new Set<string>();
  let match;
  while ((match = regex.exec(text)) !== null) {
    items.add(match[1]);
  }
  return Array.from(items);
}

function getSnippet(text: string, item: string): string {
  const escItem = item.replace(".", "\\.");
  const regex = new RegExp(`item\\s+${escItem}`, "i");
  const match = text.match(regex);
  if (match && match.index !== undefined) {
    const start = match.index;
    const slice = text.slice(start, start + 300).trim();
    return slice.length > 200 ? slice.slice(0, 197) + "..." : slice;
  }
  return text.slice(0, 200).trim();
}

/** Pure 8-K item and guidance classifier. */
export function classify8k(text: string, explicitItems?: string[]): Classified8kEvent[] {
  const items = explicitItems && explicitItems.length > 0 ? explicitItems : extractItemsFromText(text);
  const events: Classified8kEvent[] = [];

  for (const item of items) {
    const snippet = getSnippet(text, item);
    if (item === "1.01") {
      events.push({
        item,
        kind: "material-agreement",
        headline: "Item 1.01: Material Agreement",
        severity: "info",
        snippet,
      });
    } else if (item === "2.02") {
      let kind = "results/guidance";
      let headline = "Item 2.02: Results/Guidance";

      if (GUIDANCE_UP_REGEX.test(text)) {
        kind = "guidance-up";
        headline = "Item 2.02: Guidance Raised";
      } else if (GUIDANCE_DOWN_REGEX.test(text)) {
        kind = "guidance-down";
        headline = "Item 2.02: Guidance Lowered/Withdrawn";
      }

      events.push({
        item,
        kind,
        headline,
        severity: "info",
        snippet,
      });
    } else if (item === "4.02") {
      events.push({
        item,
        kind: "non-reliance",
        headline: "Item 4.02: Non-Reliance on Financials",
        severity: "critical",
        snippet,
      });
    } else if (item === "5.02") {
      events.push({
        item,
        kind: "exec-change",
        headline: "Item 5.02: Executive/Director Change",
        severity: "info",
        snippet,
      });
    }
  }

  return events;
}
