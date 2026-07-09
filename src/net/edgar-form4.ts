import { XMLParser } from "fast-xml-parser";
import { EDGAR_LIMITER } from "./edgar";
import type { Fetcher } from "./fetchers";

export type InsiderTxRow = {
  symbol: string;
  filerName: string;
  filerRole: string;
  txDate: string;
  code: string;
  shares: number;
  price: number;
  value: number;
  sharesOwnedAfter: number;
  tenPercentOwner: number;
  tenB51: number;
  accessionNo: string;
  // position of the lot within its filing — a Form 4 can report several purchase
  // lots under one accession, so (accessionNo, txIndex) is the idempotency key
  txIndex: number;
  filedAt: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: true,
});

function toArray<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function val(node: unknown): unknown {
  if (node && typeof node === "object" && "value" in (node as Record<string, unknown>)) {
    return (node as Record<string, unknown>).value;
  }
  return node;
}

function getFilerRole(reportingOwner: any): string {
  const owners = toArray(reportingOwner);
  const roles: string[] = [];
  for (const owner of owners) {
    if (!owner) continue;
    const rel = owner.reportingOwnerRelationship || {};
    if (val(rel.isDirector) === true || val(rel.isDirector) === 1 || String(val(rel.isDirector)).toLowerCase() === "true") {
      roles.push("Director");
    }
    if (val(rel.isOfficer) === true || val(rel.isOfficer) === 1 || String(val(rel.isOfficer)).toLowerCase() === "true") {
      const title = val(rel.officerTitle);
      roles.push(title ? `Officer (${title})` : "Officer");
    }
    if (val(rel.isTenPercentOwner) === true || val(rel.isTenPercentOwner) === 1 || String(val(rel.isTenPercentOwner)).toLowerCase() === "true") {
      roles.push("10% Owner");
    }
    if (val(rel.isOther) === true || val(rel.isOther) === 1 || String(val(rel.isOther)).toLowerCase() === "true") {
      const otherText = val(rel.otherText);
      roles.push(otherText ? `Other (${otherText})` : "Other");
    }
  }
  return roles.join(", ") || "Unknown";
}

function checkTenPercentOwner(reportingOwner: any): number {
  const owners = toArray(reportingOwner);
  for (const owner of owners) {
    if (!owner) continue;
    const rel = owner.reportingOwnerRelationship || {};
    const isTenPercent = val(rel.isTenPercentOwner);
    if (
      isTenPercent === true ||
      isTenPercent === 1 ||
      String(isTenPercent).toLowerCase() === "true" ||
      String(isTenPercent) === "1"
    ) {
      return 1;
    }
  }
  return 0;
}

function findFootnoteRefs(obj: any, refs: Set<string> = new Set()): Set<string> {
  if (!obj || typeof obj !== "object") return refs;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      findFootnoteRefs(item, refs);
    }
    return refs;
  }
  for (const key of Object.keys(obj)) {
    if (key === "footnoteId") {
      const valNode = obj[key];
      const footnoteIds = toArray(valNode);
      for (const fid of footnoteIds) {
        if (fid && typeof fid === "object") {
          const ref = fid["@_ref"] || fid["ref"];
          if (ref) refs.add(String(ref));
        }
      }
    } else if (key === "@_ref" || key === "ref") {
      refs.add(String(obj[key]));
    } else {
      findFootnoteRefs(obj[key], refs);
    }
  }
  return refs;
}

/** Pure parser for Form 4 XML. Never throws; returns [] on warning/malformed. */
export function parseForm4Xml(
  xml: string,
  targetSymbol: string,
  accessionNo: string,
  filedAt: string,
): InsiderTxRow[] {
  try {
    const doc = parser.parse(xml) as Record<string, any>;
    const od = doc.ownershipDocument ?? {};
    if (!doc.ownershipDocument) {
      console.warn(`[edgar-form4] Missing ownershipDocument in accession ${accessionNo}`);
      return [];
    }

    const symbol = (val(od.issuer?.issuerTradingSymbol) || targetSymbol || "").toString().toUpperCase().trim();
    const reportingOwner = od.reportingOwner;
    const owners = toArray(reportingOwner);
    const filerName = owners
      .map((o) => String(val(o?.reportingOwnerId?.rptOwnerName) ?? "").trim())
      .filter(Boolean)
      .join(", ") || "Unknown";

    const filerRole = getFilerRole(reportingOwner);
    const tenPercentOwner = checkTenPercentOwner(reportingOwner);

    // Parse footnotes
    const footnotesMap = new Map<string, string>();
    const footnoteNodes = toArray(od.footnotes?.footnote);
    for (const fn of footnoteNodes) {
      if (!fn) continue;
      const id = fn["@_id"] || fn["id"];
      const text = fn["#text"] || fn["text"] || (typeof fn === "string" ? fn : "");
      if (id) {
        footnotesMap.set(String(id), String(text));
      }
    }

    const transactions: InsiderTxRow[] = [];
    const txnNodes = toArray(od.nonDerivativeTable?.nonDerivativeTransaction);

    for (const t of txnNodes) {
      if (!t) continue;
      const code = String(t.transactionCoding?.transactionCode ?? "").trim();
      if (code !== "P") continue; // keep transaction code P only

      const date = String(val(t.transactionDate) ?? "").trim();
      const shares = Number(val(t.transactionAmounts?.transactionShares) ?? 0);
      const price = Number(val(t.transactionAmounts?.transactionPricePerShare) ?? 0);
      const sharesOwnedAfter = Number(val(t.postTransactionAmounts?.sharesOwnedFollowingTransaction) ?? 0);

      // Detect 10b5-1 from referenced footnotes
      const refs = findFootnoteRefs(t);
      let has10b51 = false;
      for (const ref of refs) {
        const text = footnotesMap.get(ref);
        if (text && /10b5-1/i.test(text)) {
          has10b51 = true;
          break;
        }
      }

      transactions.push({
        symbol,
        filerName,
        filerRole,
        txDate: date,
        code,
        shares,
        price,
        value: shares * price,
        sharesOwnedAfter,
        tenPercentOwner,
        tenB51: has10b51 ? 1 : 0,
        accessionNo,
        txIndex: transactions.length,
        filedAt,
      });
    }

    return transactions;
  } catch (e) {
    console.warn(`[edgar-form4] Failed to parse Form 4 XML for accession ${accessionNo}:`, e);
    return [];
  }
}

/** Fetch and parse Form 4 XML using the standard/shared rate limiter. */
/** Resolve a Form 4 primaryDoc to the RAW XML path, stripping SEC's XSL viewer
 *  prefix (`xslF345X0N/…`). A doc that is already raw XML passes through. */
export function rawForm4Doc(primaryDoc: string): string {
  // "xslF345X06/form4.xml" → "form4.xml"; leave a bare "form4.xml" alone.
  const stripped = primaryDoc.replace(/^xsl[^/]*\//i, "");
  return stripped;
}

export async function fetchForm4(
  cik: string,
  accessionNo: string,
  primaryDoc: string,
  targetSymbol: string,
  filedAt: string,
  fetchImpl: Fetcher,
  userAgent: string,
  limiter = EDGAR_LIMITER,
  sleep?: (ms: number) => Promise<void>,
): Promise<InsiderTxRow[]> {
  const cleanCik = cik.replace(/\D/g, "").replace(/^0+/, "");
  const accessionNoNoDashes = accessionNo.replace(/-/g, "");
  // EDGAR indexes Form 4 primaryDoc as the XSL-styled VIEWER path
  // (e.g. "xslF345X06/form4.xml"), which serves HTML-rendered output with no
  // <ownershipDocument> root. Strip the leading "xsl…/" segment to hit the raw
  // XML in the same directory — otherwise every parse yields [] (no insider data).
  const rawDoc = rawForm4Doc(primaryDoc);
  const url = `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${accessionNoNoDashes}/${rawDoc}`;

  const res = await limiter.throttle(
    () => fetchImpl(url, { headers: { "User-Agent": userAgent, "Accept-Encoding": "gzip" } }),
    sleep,
  );
  if (!res.ok) {
    throw new Error(`EDGAR Form 4 fetch ${accessionNo}: HTTP ${res.status}`);
  }
  const text = await res.text();
  return parseForm4Xml(text, targetSymbol, accessionNo, filedAt);
}
