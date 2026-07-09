import { XMLParser } from "fast-xml-parser";
import { EDGAR_LIMITER } from "./edgar";
import type { Fetcher } from "./fetchers";

export type InstitutionalHoldingRow = {
  nameOfIssuer: string;
  cusip: string;
  value: number; // in USD thousands
  sshPrnamt: number; // shares/principal amount
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  removeNSPrefix: true,
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

/**
 * Pure parser for 13F Information Table XML.
 * Converts values to thousands of USD based on reporting date.
 */
export function parse13FXml(xml: string, periodOfReport?: string): InstitutionalHoldingRow[] {
  try {
    const doc = parser.parse(xml) as Record<string, any>;
    
    // Find the infoTable list inside the parsed document
    let infoTableNodes: any[] = [];
    if (doc.informationTable && doc.informationTable.infoTable) {
      infoTableNodes = toArray(doc.informationTable.infoTable);
    } else if (doc.informationTableDocument && doc.informationTableDocument.infoTable) {
      infoTableNodes = toArray(doc.informationTableDocument.infoTable);
    } else if (doc.infoTable) {
      infoTableNodes = toArray(doc.infoTable);
    } else {
      // Look deeper in case of other nested structures
      const keys = Object.keys(doc);
      for (const k of keys) {
        if (doc[k]?.infoTable) {
          infoTableNodes = toArray(doc[k].infoTable);
          break;
        }
      }
    }

    if (infoTableNodes.length === 0) {
      return [];
    }

    // SEC changed Form 13F to report in whole dollars instead of thousands starting from Q1 2023 filings
    // If the period of report is on or after 2023-01-01, we divide values by 1000 to convert to thousands.
    const isPost2023 = periodOfReport && periodOfReport >= "2023-01-01";

    const holdings: InstitutionalHoldingRow[] = [];
    for (const r of infoTableNodes) {
      if (!r) continue;
      const nameOfIssuer = String(val(r.nameOfIssuer) ?? "").trim();
      const cusip = String(val(r.cusip) ?? "").trim();
      let rawVal = Number(val(r.value) ?? 0);
      const sshPrnamt = Number(val(r.shrsOrPrnAmt?.sshPrnamt) ?? val(r.sshPrnamt) ?? 0);

      if (!nameOfIssuer || !cusip) continue;

      const value = isPost2023 ? rawVal / 1000 : rawVal;

      holdings.push({
        nameOfIssuer,
        cusip,
        value,
        sshPrnamt,
      });
    }

    return holdings;
  } catch (e) {
    console.warn("[edgar-13f] Failed to parse 13F XML:", e);
    return [];
  }
}

/**
 * Fetch latest 13F-HR filing holdings for a given CIK.
 * Never throws. Returns [] on warning/malformed or missing data.
 */
export async function fetch13FLatest(
  cik: string,
  fetchImpl: Fetcher,
  userAgent: string,
  limiter = EDGAR_LIMITER,
  sleep?: (ms: number) => Promise<void>,
): Promise<{ holdings: InstitutionalHoldingRow[]; periodOfReport: string; filedAt: string } | null> {
  const cleanCik = cik.replace(/\D/g, "").replace(/^0+/, "");
  const paddedCik = cleanCik.padStart(10, "0");

  try {
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
    const res = await limiter.throttle(
      () => fetchImpl(submissionsUrl, { headers: { "User-Agent": userAgent, "Accept-Encoding": "gzip" } }),
      sleep,
    );

    if (!res.ok) {
      console.warn(`[edgar-13f] CIK ${cik} submissions fetch failed: HTTP ${res.status}`);
      return null;
    }

    const submissionsJson = JSON.parse(await res.text()) as any;
    const recent = submissionsJson.filings?.recent;
    if (!recent?.accessionNumber || !recent.form) {
      console.warn(`[edgar-13f] CIK ${cik} has no recent filings in metadata`);
      return null;
    }

    // Find the latest 13F-HR
    let index13F = -1;
    const n = recent.form.length;
    for (let i = 0; i < n; i++) {
      if (recent.form[i] === "13F-HR") {
        index13F = i;
        break;
      }
    }

    if (index13F === -1) {
      console.warn(`[edgar-13f] CIK ${cik} has no 13F-HR filings`);
      return null;
    }

    const accessionNo = recent.accessionNumber[index13F];
    const filedAt = recent.filingDate?.[index13F] ?? "";
    const periodOfReport = recent.reportDate?.[index13F] ?? "";
    const accessionNoNoDashes = accessionNo.replace(/-/g, "");

    // Fetch the directory index to find the XML table file
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${accessionNoNoDashes}/index.json`;
    const indexRes = await limiter.throttle(
      () => fetchImpl(indexUrl, { headers: { "User-Agent": userAgent, "Accept-Encoding": "gzip" } }),
      sleep,
    );

    if (!indexRes.ok) {
      console.warn(`[edgar-13f] Accession ${accessionNo} index.json fetch failed: HTTP ${indexRes.status}`);
      return null;
    }

    const indexJson = JSON.parse(await indexRes.text()) as any;
    const items = toArray(indexJson.directory?.item);
    const xmlItems = items.filter((item: any) => item.name?.toLowerCase().endsWith(".xml"));

    if (xmlItems.length === 0) {
      console.warn(`[edgar-13f] Accession ${accessionNo} contains no XML files`);
      return null;
    }

    // Sort to prioritize filenames containing table/holdings/infotable
    xmlItems.sort((a: any, b: any) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aScore = (aName.includes("table") ? 2 : 0) + (aName.includes("info") ? 1 : 0);
      const bScore = (bName.includes("table") ? 2 : 0) + (bName.includes("info") ? 1 : 0);
      return bScore - aScore;
    });

    // Try parsing the XML files until we find the one with holdings
    for (const item of xmlItems) {
      const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cleanCik}/${accessionNoNoDashes}/${item.name}`;
      const xmlRes = await limiter.throttle(
        () => fetchImpl(xmlUrl, { headers: { "User-Agent": userAgent, "Accept-Encoding": "gzip" } }),
        sleep,
      );

      if (!xmlRes.ok) {
        continue;
      }

      const xmlText = await xmlRes.text();
      const holdings = parse13FXml(xmlText, periodOfReport);
      if (holdings.length > 0) {
        return {
          holdings,
          periodOfReport,
          filedAt,
        };
      }
    }

    console.warn(`[edgar-13f] Accession ${accessionNo} XML files parsed to empty holdings`);
    return null;
  } catch (e) {
    console.warn(`[edgar-13f] Error fetching/parsing 13F for CIK ${cik}:`, e);
    return null;
  }
}
