import { stripHtml } from "./filing-diff";

// Honest limits: This extracts DISCLOSED concentration only (what the filer chose
// to state) — it is NOT a supplier/customer relationship graph. The full graph
// is deferred (needs external relationship data).

export type CustomerConcentrationResult = {
  disclosed: boolean;
  maxCustomerPct: number | null;
  topNPct: number | null;
  namedCustomers: string[];
  concentrationLevel: "high" | "moderate" | "low" | "none-disclosed" | "diversified";
  evidence: string[];
  warnings?: string[];
};

const ONE_CUSTOMER_RE = /one\s+customer\s+(?:accounted\s+for|represented|contributed|constituted|were|generated)\s+(?:approximately\s+)?(\d+)\s*%/i;
const CUSTOMERS_REP_RE = /customers?\s+(?:collectively\s+)?(?:represented|accounted\s+for|contributed|constituted|were)\s+(?:approximately\s+)?(\d+)\s*%\s+of\s+(?:our\s+)?(?:consolidated\s+)?(?:net\s+)?(?:total\s+)?(?:revenue|sales)/i;
const PCT_OF_REV_RE = /(\d+)\s*%\s+of\s+(?:our\s+)?(?:consolidated\s+)?(?:net\s+)?(?:total\s+)?(?:revenues?|sales)/i;
const NO_CUSTOMER_RE = /no\s+(?:single\s+)?customer\s+(?:accounted\s+for|represented|contributed|constituted|were|generated)\s+(?:more\s+than|greater\s+than\s+)?\s*(?:10%|ten\s+percent|\d+\s*%)/i;
const LARGEST_TOP_RE = /our\s+(?:largest|top)\s+(?:three|five|ten|two|four|six|seven|eight|nine|10)\s+customers?\s+(?:represented|accounted\s+for|contributed|constituted|were|generated)\s+(?:approximately\s+)?(\d+)\s*%/i;
const PCT_FROM_TOP_RE = /(\d+)\s*%\s+of\s+(?:our\s+)?(?:consolidated\s+)?(?:net\s+)?(?:total\s+)?(?:revenues?|sales)\s+.*?from\s+(?:our\s+)?(?:largest|top)\s+(?:three|five|ten|two|four|six|seven|eight|nine|10)\s+customers?/i;

// Named customer patterns (using reluctant quantifiers and excluding commas)
const SALES_TO_NAMED_RE = /sales\s+to\s+([A-Z][A-Za-z0-9\s&.-]{1,40}?)(?:\s+(?:accounted\s+for|represented|contributed|were|amounted\s+to|of))?\s+(?:approximately\s+)?(\d+)\s*%/gi;
const NAMED_ACCOUNTED_RE = /([A-Z][A-Za-z0-9\s&.-]{1,40}?)\s+(?:accounted\s+for|represented|contributed|constituted|were)\s+(?:approximately\s+)?(\d+)\s*%\s+of\s+(?:our\s+)?(?:consolidated\s+)?(?:net\s+)?(?:total\s+)?(?:revenue|sales)/gi;

function parseNamedGroup(group: string): string[] {
  const parts = group.split(/\b(?:and|or|&)\b|,/gi);
  return parts.map(p => {
    let name = p.trim();
    // Strip prefixes like "our largest customer" if they got caught
    name = name.replace(/^(?:our\s+)?(?:largest|top|single|another|other|second|third|fourth|fifth|major)\s+customer\s+/, "");
    // Strip verbs and other trailing words if they accidentally got caught in the reluctant group
    name = name.replace(/\b(?:represented|accounted|contributed|were|amounted|of|representing|accounting|for|during|in|fiscal|year).*$/i, "");
    // Clean up trailing/leading junk, keep only letters, numbers, spaces, periods, commas, and hyphens
    name = name.replace(/[^a-zA-Z0-9\s.,-]/g, "").trim();
    // Filter out common company type words if they are standalone
    const lower = name.toLowerCase();
    if (lower === "inc" || lower === "corp" || lower === "co" || lower === "ltd" || lower === "company" || lower === "corporation") {
      return "";
    }
    // Check if it starts with uppercase letter
    if (/^[A-Z]/.test(name) && name.length >= 2) {
      return name;
    }
    return "";
  }).filter(n => n !== "");
}

export function extractCustomerConcentration(text: string): CustomerConcentrationResult {
  try {
    if (!text || typeof text !== "string") {
      return {
        disclosed: false,
        maxCustomerPct: null,
        topNPct: null,
        namedCustomers: [],
        concentrationLevel: "none-disclosed",
        evidence: [],
      };
    }

    const blocks = stripHtml(text)
      .split(/\n+/)
      .map(b => b.replace(/\s+/g, " ").trim())
      .filter(b => b.length > 0);

    const sentences: string[] = [];
    for (const block of blocks) {
      const parts = block.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed.length > 0) {
          sentences.push(trimmed);
        }
      }
    }

    let disclosed = false;
    let maxCustomerPct: number | null = null;
    let topNPct: number | null = null;
    const namedCustomersSet = new Set<string>();
    const evidence: string[] = [];
    let isDiversified = false;

    for (const sentence of sentences) {
      let matched = false;

      // 1. Check diversified
      if (NO_CUSTOMER_RE.test(sentence)) {
        matched = true;
        isDiversified = true;
        disclosed = true;
        if (evidence.length < 3 && !evidence.includes(sentence)) {
          evidence.push(sentence);
        }
        continue; // skip other patterns for this sentence
      }

      // 2. Check top N
      let topNPctMatch = sentence.match(LARGEST_TOP_RE) || sentence.match(PCT_FROM_TOP_RE);
      if (topNPctMatch) {
        matched = true;
        const pct = parseInt(topNPctMatch[1], 10);
        if (!isNaN(pct)) {
          topNPct = Math.max(topNPct ?? 0, pct);
        }
        disclosed = true;
        if (evidence.length < 3 && !evidence.includes(sentence)) {
          evidence.push(sentence);
        }
        continue; // skip single-customer patterns for this sentence
      }

      // 3. Check named customer patterns
      let salesToNamedMatches = Array.from(sentence.matchAll(SALES_TO_NAMED_RE));
      if (salesToNamedMatches.length > 0) {
        matched = true;
        for (const match of salesToNamedMatches) {
          const names = parseNamedGroup(match[1]);
          for (const name of names) {
            namedCustomersSet.add(name);
          }
          const pct = parseInt(match[2], 10);
          if (!isNaN(pct)) {
            maxCustomerPct = Math.max(maxCustomerPct ?? 0, pct);
          }
        }
      }

      let namedAccountedMatches = Array.from(sentence.matchAll(NAMED_ACCOUNTED_RE));
      if (namedAccountedMatches.length > 0) {
        matched = true;
        for (const match of namedAccountedMatches) {
          const names = parseNamedGroup(match[1]);
          for (const name of names) {
            namedCustomersSet.add(name);
          }
          const pct = parseInt(match[2], 10);
          if (!isNaN(pct)) {
            maxCustomerPct = Math.max(maxCustomerPct ?? 0, pct);
          }
        }
      }

      // 4. Check general single customer patterns
      let oneCustomerMatch = sentence.match(ONE_CUSTOMER_RE);
      if (oneCustomerMatch) {
        matched = true;
        const pct = parseInt(oneCustomerMatch[1], 10);
        if (!isNaN(pct)) {
          maxCustomerPct = Math.max(maxCustomerPct ?? 0, pct);
        }
      }

      let customersRepMatch = sentence.match(CUSTOMERS_REP_RE);
      if (customersRepMatch) {
        matched = true;
        const pct = parseInt(customersRepMatch[1], 10);
        if (!isNaN(pct)) {
          maxCustomerPct = Math.max(maxCustomerPct ?? 0, pct);
        }
      }

      let pctOfRevMatch = sentence.match(PCT_OF_REV_RE);
      if (pctOfRevMatch) {
        matched = true;
        const pct = parseInt(pctOfRevMatch[1], 10);
        if (!isNaN(pct)) {
          maxCustomerPct = Math.max(maxCustomerPct ?? 0, pct);
        }
      }

      if (matched) {
        disclosed = true;
        if (evidence.length < 3 && !evidence.includes(sentence)) {
          evidence.push(sentence);
        }
      }
    }

    const namedCustomers = Array.from(namedCustomersSet);

    // Determine concentration level
    let concentrationLevel: "high" | "moderate" | "low" | "none-disclosed" | "diversified" = "none-disclosed";

    if (disclosed) {
      if (isDiversified && maxCustomerPct === null && topNPct === null) {
        concentrationLevel = "diversified";
      } else {
        const hasHighMax = maxCustomerPct !== null && maxCustomerPct >= 20;
        const hasHighNamed = maxCustomerPct !== null && maxCustomerPct >= 10 && namedCustomers.length > 0 && namedCustomers.length <= 3;
        
        if (hasHighMax || hasHighNamed) {
          concentrationLevel = "high";
        } else if ((maxCustomerPct !== null && maxCustomerPct >= 10) || (topNPct !== null && topNPct >= 20)) {
          concentrationLevel = "moderate";
        } else {
          concentrationLevel = "low";
        }
      }
    }

    return {
      disclosed,
      maxCustomerPct,
      topNPct,
      namedCustomers,
      concentrationLevel,
      evidence,
    };
  } catch (err) {
    return {
      disclosed: false,
      maxCustomerPct: null,
      topNPct: null,
      namedCustomers: [],
      concentrationLevel: "none-disclosed",
      evidence: [],
      warnings: [err instanceof Error ? err.message : String(err)],
    };
  }
}
