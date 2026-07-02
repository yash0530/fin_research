import { describe, it, expect } from "vitest";
import { parseForm4, clusterBuySignal, purchasesFromFilings } from "./insider-form4";
import { parseOwnership } from "./institutional";
import { optionsMetrics } from "./options-metrics";

const FORM4 = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer><issuerTradingSymbol>MU</issuerTradingSymbol></issuer>
  <reportingOwner><reportingOwnerId><rptOwnerName>Doe John</rptOwnerName></reportingOwnerId></reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2024-05-01</value></transactionDate>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>90.5</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

describe("insider Form 4", () => {
  it("parses issuer, insider, and non-derivative transactions", () => {
    const f = parseForm4(FORM4);
    expect(f.symbol).toBe("MU");
    expect(f.insider).toBe("Doe John");
    expect(f.transactions).toHaveLength(1);
    expect(f.transactions[0]).toMatchObject({ code: "P", shares: 1000, pricePerShare: 90.5, acquiredDisposed: "A" });
  });

  it("detects a cluster buy across distinct insiders", () => {
    const purchases = purchasesFromFilings([
      { symbol: "MU", insider: "A", transactions: [{ date: "2024-05-01", code: "P", shares: 1000, pricePerShare: 90, acquiredDisposed: "A" }] },
      { symbol: "MU", insider: "B", transactions: [{ date: "2024-05-02", code: "P", shares: 500, pricePerShare: 92, acquiredDisposed: "A" }] },
      { symbol: "MU", insider: "C", transactions: [{ date: "2024-05-03", code: "S", shares: 100, pricePerShare: 95, acquiredDisposed: "D" }] },
    ]);
    expect(purchases).toHaveLength(2); // the sale (S/D) is excluded
    const sig = clusterBuySignal(purchases, { minBuyers: 2 });
    expect(sig.cluster).toBe(true);
    expect(sig.buyers).toBe(2);
    expect(sig.totalValue).toBeCloseTo(1000 * 90 + 500 * 92);
  });

  it("is not a cluster with a single buyer", () => {
    const sig = clusterBuySignal([{ insider: "A", date: "2024-05-01", shares: 100, pricePerShare: 90 }], { minBuyers: 2 });
    expect(sig.cluster).toBe(false);
  });
});

describe("institutional ownership", () => {
  it("parses institutions % and top holders (handling {raw} wrappers)", () => {
    const o = parseOwnership({
      majorHoldersBreakdown: { institutionsPercentHeld: { raw: 0.72 } },
      institutionOwnership: { ownershipList: [{ organization: "Vanguard", pctHeld: { raw: 0.08 }, position: { raw: 1_000_000 } }] },
    });
    expect(o.institutionsPct).toBeCloseTo(0.72);
    expect(o.topHolders[0]).toMatchObject({ name: "Vanguard", pctHeld: 0.08, shares: 1_000_000 });
  });
});

describe("options metrics", () => {
  it("computes put/call ratio, ATM IV, and unusual volume", () => {
    const m = optionsMetrics({
      underlying: 100,
      calls: [
        { strike: 100, openInterest: 200, impliedVolatility: 0.5, volume: 100 },
        { strike: 105, openInterest: 100, impliedVolatility: 0.45 },
      ],
      puts: [
        { strike: 100, openInterest: 400, impliedVolatility: 0.55 },
        { strike: 95, openInterest: 50, impliedVolatility: 0.6, volume: 500 },
      ],
    });
    expect(m.putCallRatio).toBeCloseTo(1.5); // 450/300
    expect(m.atmIV).toBeCloseTo(0.525); // (0.5+0.55)/2
    expect(m.unusual).toBe(1); // put strike 95: 500 > 3×50
  });
});
