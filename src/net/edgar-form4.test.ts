import { describe, it, expect } from "vitest";
import { parseForm4Xml, fetchForm4, rawForm4Doc } from "./edgar-form4";
import { RateLimiter } from "./rate-limiter";
import type { HttpResponse } from "./fetchers";

const XML_FIXTURE_1 = `<?xml version="1.0"?>
<ownershipDocument>
    <issuer>
        <issuerTradingSymbol>AAPL</issuerTradingSymbol>
    </issuer>
    <reportingOwner>
        <reportingOwnerId>
            <rptOwnerName>Cook Tim</rptOwnerName>
        </reportingOwnerId>
        <reportingOwnerRelationship>
            <isDirector>true</isDirector>
            <isOfficer>true</isOfficer>
            <officerTitle>CEO</officerTitle>
            <isTenPercentOwner>false</isTenPercentOwner>
        </reportingOwnerRelationship>
    </reportingOwner>
    <nonDerivativeTable>
        <nonDerivativeTransaction>
            <transactionDate>
                <value>2023-10-15</value>
            </transactionDate>
            <transactionCoding>
                <transactionCode>P</transactionCode>
            </transactionCoding>
            <transactionAmounts>
                <transactionShares>
                    <value>1000</value>
                    <footnoteId ref="F1"/>
                </transactionShares>
                <transactionPricePerShare>
                    <value>150.00</value>
                </transactionPricePerShare>
                <transactionAcquiredDisposedCode>
                    <value>A</value>
                </transactionAcquiredDisposedCode>
            </transactionAmounts>
            <postTransactionAmounts>
                <sharesOwnedFollowingTransaction>
                    <value>50000</value>
                </sharesOwnedFollowingTransaction>
            </postTransactionAmounts>
        </nonDerivativeTransaction>
        <nonDerivativeTransaction>
            <transactionDate>
                <value>2023-10-16</value>
            </transactionDate>
            <transactionCoding>
                <transactionCode>M</transactionCode>
            </transactionCoding>
            <transactionAmounts>
                <transactionShares>
                    <value>5000</value>
                </transactionShares>
                <transactionPricePerShare>
                    <value>100.00</value>
                </transactionPricePerShare>
                <transactionAcquiredDisposedCode>
                    <value>A</value>
                </transactionAcquiredDisposedCode>
            </transactionAmounts>
            <postTransactionAmounts>
                <sharesOwnedFollowingTransaction>
                    <value>55000</value>
                </sharesOwnedFollowingTransaction>
            </postTransactionAmounts>
        </nonDerivativeTransaction>
    </nonDerivativeTable>
    <footnotes>
        <footnote id="F1">These shares were purchased under a Rule 10b5-1 trading plan.</footnote>
    </footnotes>
</ownershipDocument>`;

const XML_FIXTURE_2 = `<?xml version="1.0"?>
<ownershipDocument>
    <issuer>
        <issuerTradingSymbol>MSFT</issuerTradingSymbol>
    </issuer>
    <reportingOwner>
        <reportingOwnerId>
            <rptOwnerName>Gates Bill</rptOwnerName>
        </reportingOwnerId>
        <reportingOwnerRelationship>
            <isDirector>false</isDirector>
            <isOfficer>false</isOfficer>
            <isTenPercentOwner>true</isTenPercentOwner>
        </reportingOwnerRelationship>
    </reportingOwner>
    <nonDerivativeTable>
        <nonDerivativeTransaction>
            <transactionDate>
                <value>2023-10-17</value>
            </transactionDate>
            <transactionCoding>
                <transactionCode>P</transactionCode>
            </transactionCoding>
            <transactionAmounts>
                <transactionShares>
                    <value>2000</value>
                </transactionShares>
                <transactionPricePerShare>
                    <value>300.00</value>
                </transactionPricePerShare>
                <transactionAcquiredDisposedCode>
                    <value>A</value>
                </transactionAcquiredDisposedCode>
            </transactionAmounts>
            <postTransactionAmounts>
                <sharesOwnedFollowingTransaction>
                    <value>100000</value>
                </sharesOwnedFollowingTransaction>
            </postTransactionAmounts>
        </nonDerivativeTransaction>
    </nonDerivativeTable>
</ownershipDocument>`;

describe("Edgar Form 4 Parser", () => {
  it("parses valid XML and extracts only code P transactions, mapping 10b5-1 and roles", () => {
    const txs = parseForm4Xml(XML_FIXTURE_1, "AAPL", "0001-test", "2023-10-18");
    expect(txs).toHaveLength(1);
    expect(txs[0]).toEqual({
      symbol: "AAPL",
      filerName: "Cook Tim",
      filerRole: "Director, Officer (CEO)",
      txDate: "2023-10-15",
      code: "P",
      shares: 1000,
      price: 150.0,
      value: 150000.0,
      sharesOwnedAfter: 50000,
      tenPercentOwner: 0,
      tenB51: 1,
      accessionNo: "0001-test",
      txIndex: 0,
      filedAt: "2023-10-18",
    });
  });

  it("assigns sequential txIndex to multiple purchase lots in one accession", () => {
    const secondLot = `<nonDerivativeTransaction>
            <transactionDate><value>2023-10-16</value></transactionDate>
            <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
            <transactionAmounts>
                <transactionShares><value>500</value></transactionShares>
                <transactionPricePerShare><value>151.00</value></transactionPricePerShare>
            </transactionAmounts>
            <postTransactionAmounts>
                <sharesOwnedFollowingTransaction><value>50500</value></sharesOwnedFollowingTransaction>
            </postTransactionAmounts>
        </nonDerivativeTransaction>
    </nonDerivativeTable>`;
    const xml = XML_FIXTURE_1.replace("</nonDerivativeTable>", secondLot);
    const txs = parseForm4Xml(xml, "AAPL", "0001-test", "2023-10-18");
    expect(txs).toHaveLength(2);
    expect(txs.map((t) => t.txIndex)).toEqual([0, 1]);
    expect(txs[1].value).toBe(500 * 151.0);
  });

  it("extracts 10% owner flags correctly", () => {
    const txs = parseForm4Xml(XML_FIXTURE_2, "MSFT", "0002-test", "2023-10-19");
    expect(txs).toHaveLength(1);
    expect(txs[0].filerRole).toBe("10% Owner");
    expect(txs[0].tenPercentOwner).toBe(1);
    expect(txs[0].tenB51).toBe(0);
  });

  it("handles malformed XML gracefully", () => {
    const txs = parseForm4Xml("<ownershipDocument><invalid>", "AAPL", "0003-test", "2023-10-20");
    expect(txs).toEqual([]);
  });

  it("fetches Form 4 XML via HTTP and parses it", async () => {
    const mockResponse: HttpResponse = {
      ok: true,
      status: 200,
      text: async () => XML_FIXTURE_1,
    };
    const mockFetch = async () => mockResponse;
    const limiter = new RateLimiter(999); // infinite rate for test

    const txs = await fetchForm4(
      "1318605",
      "0001-test",
      "primary.xml",
      "AAPL",
      "2023-10-18",
      mockFetch,
      "TestAgent email@test.com",
      limiter,
    );
    expect(txs).toHaveLength(1);
    expect(txs[0].symbol).toBe("AAPL");
    expect(txs[0].filerName).toBe("Cook Tim");
  });
});

describe("rawForm4Doc", () => {
  it("strips the SEC XSL viewer prefix to reach the raw XML", () => {
    expect(rawForm4Doc("xslF345X06/form4.xml")).toBe("form4.xml");
    expect(rawForm4Doc("xslF345X05/wk-form4_123.xml")).toBe("wk-form4_123.xml");
  });
  it("passes through a doc that is already raw XML", () => {
    expect(rawForm4Doc("form4.xml")).toBe("form4.xml");
    expect(rawForm4Doc("edgardoc.xml")).toBe("edgardoc.xml");
  });
});
