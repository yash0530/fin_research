import { describe, it, expect } from "vitest";
import { parse13FXml, fetch13FLatest } from "./edgar-13f";
import { RateLimiter } from "./rate-limiter";
import type { HttpResponse } from "./fetchers";

const XML_FIXTURE_1 = `<?xml version="1.0" encoding="utf-8"?>
<informationTable xmlns="http://www.sec.gov/document/threedimensional/infotable">
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>037833100</cusip>
    <value>1500000</value>
    <shrsOrPrnAmt>
      <sshPrnamt>10000</sshPrnamt>
      <sshPrnamtType>SH</sshPrnamtType>
    </shrsOrPrnAmt>
  </infoTable>
  <infoTable>
    <nameOfIssuer>MICROSOFT CORP</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>594918104</cusip>
    <value>2500000</value>
    <shrsOrPrnAmt>
      <sshPrnamt>20000</sshPrnamt>
      <sshPrnamtType>SH</sshPrnamtType>
    </shrsOrPrnAmt>
  </infoTable>
</informationTable>`;

describe("Edgar 13F XML Parser", () => {
  it("parses valid XML for pre-2023 reports without dividing values", () => {
    const holdings = parse13FXml(XML_FIXTURE_1, "2022-12-31");
    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toEqual({
      nameOfIssuer: "APPLE INC",
      cusip: "037833100",
      value: 1500000,
      sshPrnamt: 10000,
    });
    expect(holdings[1].nameOfIssuer).toBe("MICROSOFT CORP");
    expect(holdings[1].value).toBe(2500000);
  });

  it("parses valid XML for post-2023 reports dividing values by 1000", () => {
    const holdings = parse13FXml(XML_FIXTURE_1, "2023-03-31");
    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toEqual({
      nameOfIssuer: "APPLE INC",
      cusip: "037833100",
      value: 1500, // 1500000 / 1000
      sshPrnamt: 10000,
    });
    expect(holdings[1].value).toBe(2500); // 2500000 / 1000
  });

  it("handles malformed XML gracefully", () => {
    const holdings = parse13FXml("<informationTable><invalid>", "2023-03-31");
    expect(holdings).toEqual([]);
  });

  it("returns empty list if XML doesn't contain infoTable elements", () => {
    const emptyXml = `<?xml version="1.0"?><otherRoot></otherRoot>`;
    const holdings = parse13FXml(emptyXml, "2023-03-31");
    expect(holdings).toEqual([]);
  });
});

describe("fetch13FLatest", () => {
  it("fetches, resolves, and parses latest 13F-HR filings", async () => {
    const submissionsMock = {
      filings: {
        recent: {
          accessionNumber: ["0001067983-23-000001", "0001067983-22-000002"],
          form: ["13F-HR", "10-K"],
          filingDate: ["2023-05-15", "2022-03-01"],
          reportDate: ["2023-03-31", "2021-12-31"],
        },
      },
    };

    const indexMock = {
      directory: {
        item: [
          { name: "form13f.xml", type: "file" },
          { name: "infotable.xml", type: "file" },
        ],
      },
    };

    const mockFetch = async (url: string): Promise<HttpResponse> => {
      if (url.includes("submissions")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(submissionsMock),
          json: async () => submissionsMock,
        } as HttpResponse;
      }
      if (url.includes("index.json")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(indexMock),
          json: async () => indexMock,
        } as HttpResponse;
      }
      if (url.includes("infotable.xml")) {
        return {
          ok: true,
          status: 200,
          text: async () => XML_FIXTURE_1,
          json: async () => ({}),
        } as HttpResponse;
      }
      return { ok: false, status: 404, text: async () => "" } as HttpResponse;
    };

    const limiter = new RateLimiter(999);
    const result = await fetch13FLatest("0001067983", mockFetch, "TestAgent contact@test.com", limiter);

    expect(result).not.toBeNull();
    expect(result?.periodOfReport).toBe("2023-03-31");
    expect(result?.filedAt).toBe("2023-05-15");
    expect(result?.holdings).toHaveLength(2);
    expect(result?.holdings[0].value).toBe(1500); // 1500000 / 1000 since date is 2023-03-31
  });

  it("handles missing 13F-HR filings gracefully", async () => {
    const submissionsMock = {
      filings: {
        recent: {
          accessionNumber: ["0001067983-22-000002"],
          form: ["10-K"],
          filingDate: ["2022-03-01"],
          reportDate: ["2021-12-31"],
        },
      },
    };

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(submissionsMock),
      json: async () => submissionsMock,
    }) as HttpResponse;

    const limiter = new RateLimiter(999);
    const result = await fetch13FLatest("0001067983", mockFetch, "TestAgent contact@test.com", limiter);
    expect(result).toBeNull();
  });
});
