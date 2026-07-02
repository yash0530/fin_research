import { XMLParser } from "fast-xml-parser";

// EDGAR Form 4 (insider transactions). `parseForm4` extracts non-derivative
// transactions from the filing XML; `clusterBuySignal` flags multiple distinct
// insiders buying (code "P") within a window — the meaningful signal. Parsing is
// fixture-tested; the fetch (rate-limited via EDGAR_LIMITER) is a thin wrapper.

export type Form4Txn = {
  date: string;
  code: string; // P=purchase, S=sale, A=grant, ...
  shares: number;
  pricePerShare: number;
  acquiredDisposed: "A" | "D" | "";
};

export type Form4Filing = {
  symbol: string;
  insider: string;
  transactions: Form4Txn[];
};

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });

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

export function parseForm4(xml: string): Form4Filing {
  const doc = parser.parse(xml) as Record<string, any>;
  const od = doc.ownershipDocument ?? {};
  const symbol = String(val(od.issuer?.issuerTradingSymbol) ?? "").toUpperCase();
  const insider = String(od.reportingOwner?.reportingOwnerId?.rptOwnerName ?? "").trim();
  const txnNodes = toArray(od.nonDerivativeTable?.nonDerivativeTransaction);
  const transactions: Form4Txn[] = txnNodes.map((t: any) => ({
    date: String(val(t.transactionDate) ?? ""),
    code: String(t.transactionCoding?.transactionCode ?? ""),
    shares: Number(val(t.transactionAmounts?.transactionShares) ?? 0),
    pricePerShare: Number(val(t.transactionAmounts?.transactionPricePerShare) ?? 0),
    acquiredDisposed: (String(val(t.transactionAmounts?.transactionAcquiredDisposedCode) ?? "") as "A" | "D" | ""),
  }));
  return { symbol, insider, transactions };
}

export type InsiderPurchase = { insider: string; date: string; shares: number; pricePerShare: number };

export type ClusterBuySignal = {
  cluster: boolean;
  buyers: number;
  totalShares: number;
  totalValue: number;
};

/** Cluster buy = >= minBuyers distinct insiders with open-market purchases (code P). */
export function clusterBuySignal(
  purchases: InsiderPurchase[],
  opts: { minBuyers?: number } = {},
): ClusterBuySignal {
  const minBuyers = opts.minBuyers ?? 2;
  const buyers = new Set(purchases.map((p) => p.insider));
  const totalShares = purchases.reduce((s, p) => s + p.shares, 0);
  const totalValue = purchases.reduce((s, p) => s + p.shares * p.pricePerShare, 0);
  return {
    cluster: buyers.size >= minBuyers,
    buyers: buyers.size,
    totalShares,
    totalValue,
  };
}

/** Extract open-market purchases (code P, acquired) from parsed filings. */
export function purchasesFromFilings(filings: Form4Filing[]): InsiderPurchase[] {
  const out: InsiderPurchase[] = [];
  for (const f of filings) {
    for (const t of f.transactions) {
      if (t.code === "P" && t.acquiredDisposed === "A") {
        out.push({ insider: f.insider, date: t.date, shares: t.shares, pricePerShare: t.pricePerShare });
      }
    }
  }
  return out;
}
