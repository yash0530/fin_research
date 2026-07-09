import { describe, it, expect, vi } from "vitest";
import { jobCatalog, buildLiveRegistry, type JobEntry } from "./registry-live";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { applyMigrations, type SqlDb } from "../db/migrate";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

function loadMigrations(): { name: string; sql: string }[] {
  const dir = "prisma/migrations";
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      name: f.replace(/\.sql$/, ""),
      sql: readFileSync(join(dir, f), "utf8"),
    }));
}

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, loadMigrations());
  return db;
}

// The registry must ASSEMBLE offline (no DB, no network). We only assert the
// shape/metadata here; the `run` bodies build live fetchers lazily and are exercised
// against real services by the CLI, never in vitest.
describe("live registry assembly", () => {
  process.env.EDGAR_USER_AGENT = "TestAgent email@test.com";
  const EXPECTED = [
    "prices10y",
    "fundamentals",
    "edgar_index",
    "edgar_facts",
    "stats",
    "news",
    "earnings",
    "rules",
    "digest",
    "overnight",
    "refresh_data",
    "dossier",
    "story",
    "backup",
    "buylist_draft",
    "outcomes",
    "campaign",
    "universe_check",
    "integrity_check",
    "backtest",
    "portfolio_check",
    "screens",
    "form4",
    "events8k",
    "holdings_13f",
    "research_run",
    "research_create",
  ];

  it("jobCatalog lists every job with a describe, no DB required", () => {
    const cat = jobCatalog();
    expect(cat.map((j) => j.name)).toEqual(EXPECTED);
    for (const j of cat) expect(j.describe.length).toBeGreaterThan(0);
  });

  it("includes the new backup job", () => {
    expect(jobCatalog().map((j) => j.name)).toContain("backup");
  });

  it("buildLiveRegistry(db) binds db in and preserves names/order + runnable entries", () => {
    const db = migratedDb();
    const reg: JobEntry[] = buildLiveRegistry(db);
    expect(reg.map((j) => j.name)).toEqual(EXPECTED);
    for (const j of reg) expect(typeof j.run).toBe("function");
    // Catalog and bound registry are single-sourced (same names, same describes).
    expect(reg.map((j) => j.describe)).toEqual(jobCatalog().map((j) => j.describe));
  });

  it("screens job should compute metrics and upsert Candidates in memory DB", async () => {
    const db = migratedDb();
    const reg = buildLiveRegistry(db);
    const screensJob = reg.find((j) => j.name === "screens");
    expect(screensJob).toBeDefined();

    // Seed mock Sector, Ticker and TickerSector
    db.prepare('INSERT INTO "Sector" ("code", "name", "taxonomy") VALUES (?, ?, ?)').run("g_info_tech", "Information Technology", "gics");
    db.prepare('INSERT INTO "Ticker" ("symbol", "class", "active", "marketCap") VALUES (?, ?, ?, ?)').run("AAPL", "stock", 1, 2000000000);
    db.prepare('INSERT INTO "TickerSector" ("symbol", "sectorCode") VALUES (?, ?)').run("AAPL", "g_info_tech");

    // Seed 30 quarters of mock FundamentalsQuarter
    const stmt = db.prepare(
      'INSERT INTO "FundamentalsQuarter" ' +
      '("symbol", "periodEnd", "revenue", "grossProfit", "operatingIncome", "netIncome", "fcf", "totalAssets", "totalDebt", "cash", "sharesOut", "cfo", "currentAssets", "currentLiabilities") ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const dates: string[] = [];
    for (let year = 2018; year <= 2025; year++) {
      for (const month of ["03", "06", "09", "12"]) {
        dates.push(`${year}-${month}-31`);
      }
    }
    const targetDates = dates.slice(0, 30);

    for (let i = 0; i < targetDates.length; i++) {
      // Simulate non-periodic EPS variation to avoid 0 standard deviation in earnings trend
      const val = 1.0 + Math.sin(i) * 0.1;
      stmt.run(
        "AAPL",
        targetDates[i],
        1000,           // revenue
        600,            // grossProfit
        200,            // operatingIncome
        val * 100,      // netIncome
        80,             // fcf
        5000,           // totalAssets
        1000,           // totalDebt
        500,            // cash
        100,            // sharesOut
        150,            // cfo
        1500,           // currentAssets
        1000            // currentLiabilities
      );
    }

    const outcome = await screensJob!.run(["AAPL"]);
    expect(outcome.ok).toBe(true);

    const candidates = db.prepare('SELECT * FROM "Candidate" WHERE "symbol"=?').all("AAPL") as any[];
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate.symbol).toBe("AAPL");
    expect(candidate.userState).toBe("INBOX");
    expect(typeof candidate.qualification).toBe("string");
    const qual = JSON.parse(candidate.qualification);
    expect(qual).toHaveProperty("fscore");
    expect(qual).toHaveProperty("accruals");
    expect(qual).toHaveProperty("dilution");
    expect(qual).toHaveProperty("cohort");
    expect(qual).toHaveProperty("earningsTrend");
  });

  it("form4 job should fetch, parse, and check clusters", async () => {
    const db = migratedDb();
    const reg = buildLiveRegistry(db);
    const form4Job = reg.find((j) => j.name === "form4");
    expect(form4Job).toBeDefined();

    // Seed mock Ticker
    db.prepare('INSERT INTO "Ticker" ("symbol", "class", "active", "marketCap") VALUES (?, ?, ?, ?)').run("AAPL", "stock", 1, 25_000_000_000);
    // Seed mock EdgarFiling Form 4 in last 90 days
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      'INSERT INTO "EdgarFiling" ("accessionNo", "symbol", "cik", "form", "filedAt", "primaryDoc") VALUES (?, ?, ?, ?, ?, ?)'
    ).run("0001-form4", "AAPL", "12345", "4", today, "primary.xml");

    // Stub global fetch
    const mockXml = `<?xml version="1.0"?>
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
            </reportingOwnerRelationship>
        </reportingOwner>
        <nonDerivativeTable>
            <nonDerivativeTransaction>
                <transactionDate>
                    <value>${today}</value>
                </transactionDate>
                <transactionCoding>
                    <transactionCode>P</transactionCode>
                </transactionCoding>
                <transactionAmounts>
                    <transactionShares>
                        <value>10000</value>
                    </transactionShares>
                    <transactionPricePerShare>
                        <value>100.00</value>
                    </transactionPricePerShare>
                </transactionAmounts>
                <postTransactionAmounts>
                    <sharesOwnedFollowingTransaction>
                        <value>50000</value>
                    </sharesOwnedFollowingTransaction>
                </postTransactionAmounts>
            </nonDerivativeTransaction>
        </nonDerivativeTable>
    </ownershipDocument>`;

    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => mockXml,
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse as any);

    try {
      const outcome = await form4Job!.run(["AAPL"]);
      expect(outcome.ok).toBe(true);

      // Verify transaction inserted
      const txs = db.prepare('SELECT * FROM "InsiderTx" WHERE "symbol"=?').all("AAPL") as any[];
      expect(txs).toHaveLength(1);
      expect(txs[0].filerName).toBe("Cook Tim");

      // Verify no cluster was created (since there is only 1 insider)
      let candidates = db.prepare('SELECT * FROM "Candidate" WHERE "symbol"=?').all("AAPL") as any[];
      expect(candidates).toHaveLength(0); // no candidate created since it didn't cluster

      // Now add another transaction from a different insider to trigger a cluster
      const mockXmlCluster = `<?xml version="1.0"?>
      <ownershipDocument>
          <issuer>
              <issuerTradingSymbol>AAPL</issuerTradingSymbol>
          </issuer>
          <reportingOwner>
              <reportingOwnerId>
                  <rptOwnerName>Maestri Luca</rptOwnerName>
              </reportingOwnerId>
              <reportingOwnerRelationship>
                  <isOfficer>true</isOfficer>
                  <officerTitle>CFO</officerTitle>
              </reportingOwnerRelationship>
          </reportingOwner>
          <nonDerivativeTable>
              <nonDerivativeTransaction>
                  <transactionDate>
                      <value>${today}</value>
                  </transactionDate>
                  <transactionCoding>
                      <transactionCode>P</transactionCode>
                  </transactionCoding>
                  <transactionAmounts>
                      <transactionShares>
                          <value>10000</value>
                      </transactionShares>
                      <transactionPricePerShare>
                          <value>100.00</value>
                      </transactionPricePerShare>
                  </transactionAmounts>
                  <postTransactionAmounts>
                      <sharesOwnedFollowingTransaction>
                          <value>40000</value>
                      </sharesOwnedFollowingTransaction>
                  </postTransactionAmounts>
              </nonDerivativeTransaction>
          </nonDerivativeTable>
      </ownershipDocument>`;

      db.prepare(
        'INSERT INTO "EdgarFiling" ("accessionNo", "symbol", "cik", "form", "filedAt", "primaryDoc") VALUES (?, ?, ?, ?, ?, ?)'
      ).run("0002-form4", "AAPL", "12345", "4", today, "primary2.xml");

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => mockXml,
      } as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => mockXmlCluster,
      } as any);

      // Run it again
      const outcome2 = await form4Job!.run(["AAPL"]);
      expect(outcome2.ok).toBe(true);

      // Verify cluster candidate is created
      candidates = db.prepare('SELECT * FROM "Candidate" WHERE "symbol"=?').all("AAPL") as any[];
      expect(candidates).toHaveLength(1);
      expect(candidates[0].triggerTags).toContain("insider-cluster");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("events8k job should fetch, classify, and insert filing events", async () => {
    const db = migratedDb();
    const reg = buildLiveRegistry(db);
    const events8kJob = reg.find((j) => j.name === "events8k");
    expect(events8kJob).toBeDefined();

    // Seed mock Ticker
    db.prepare('INSERT INTO "Ticker" ("symbol", "class", "active") VALUES (?, ?, ?)').run("MSFT", "stock", 1);
    // Seed mock EdgarFiling 8-K in last 30 days
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      'INSERT INTO "EdgarFiling" ("accessionNo", "symbol", "cik", "form", "filedAt", "primaryDoc") VALUES (?, ?, ?, ?, ?, ?)'
    ).run("0001-8k", "MSFT", "12345", "8-K", today, "primary.htm");

    // Mock response for 8-K containing critical 4.02 and raised guidance 2.02
    const mockHtml = `
      <html>
        <body>
          We filed Item 4.02 Non-Reliance on Financials.
          We also filed Item 2.02 and raised full year guidance.
        </body>
      </html>
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockHtml,
    } as any);

    try {
      const outcome = await events8kJob!.run(["MSFT"]);
      expect(outcome.ok).toBe(true);

      const events = db.prepare('SELECT * FROM "FilingEvent" WHERE "symbol"=? ORDER BY "item" ASC').all("MSFT") as any[];
      expect(events).toHaveLength(2);
      expect(events[0].item).toBe("2.02");
      expect(events[0].kind).toBe("guidance-up");
      expect(events[1].item).toBe("4.02");
      expect(events[1].kind).toBe("non-reliance");
      expect(events[1].severity).toBe("critical");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("events8k job should detect spinoff and merge spinoff trigger tag", async () => {
    const db = migratedDb();
    const reg = buildLiveRegistry(db);
    const events8kJob = reg.find((j) => j.name === "events8k");
    expect(events8kJob).toBeDefined();

    // Seed mock Ticker
    db.prepare('INSERT INTO "Ticker" ("symbol", "class", "active") VALUES (?, ?, ?)').run("SPIN", "stock", 1);
    // Seed mock EdgarFiling 8-K in last 30 days
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      'INSERT INTO "EdgarFiling" ("accessionNo", "symbol", "cik", "form", "filedAt", "primaryDoc") VALUES (?, ?, ?, ?, ?, ?)'
    ).run("0002-8k", "SPIN", "54321", "8-K", today, "primary.htm");

    const spinoffHtml = `
      <html>
        <body>
          Item 2.01 Completion of Acquisition or Disposition of Assets.
          The company completed the distribution and spinoff of its business.
        </body>
      </html>
    `;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => spinoffHtml,
    } as any);

    try {
      const outcome = await events8kJob!.run(["SPIN"]);
      expect(outcome.ok).toBe(true);

      const events = db.prepare('SELECT * FROM "FilingEvent" WHERE "symbol"=?').all("SPIN") as any[];
      expect(events).toHaveLength(1);
      expect(events[0].item).toBe("spinoff");
      expect(events[0].kind).toBe("spinoff");
      expect(events[0].severity).toBe("notable");
      expect(events[0].headline).toBe("Spin-off Completed");

      const candidates = db.prepare('SELECT * FROM "Candidate" WHERE "symbol"=?').all("SPIN") as any[];
      expect(candidates).toHaveLength(1);
      const tags = JSON.parse(candidates[0].triggerTags);
      expect(tags).toContain("spinoff");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("holdings_13f job should fetch, parse, and insert holdings, and update candidate tags", async () => {
    const db = migratedDb();
    const reg = buildLiveRegistry(db);
    const holdingsJob = reg.find((j) => j.name === "holdings_13f");
    expect(holdingsJob).toBeDefined();

    // Seed mock Ticker AAPL
    db.prepare('INSERT INTO "Ticker" ("symbol", "class", "active", "name") VALUES (?, ?, ?, ?)').run("AAPL", "stock", 1, "Apple Inc.");

    // Seed Candidate for AAPL
    db.prepare(
      'INSERT INTO "Candidate" ("symbol", "tier", "triggerTags", "qualification", "computedAt", "userState") VALUES (?, ?, ?, ?, ?, ?)'
    ).run("AAPL", 2, JSON.stringify(["Cheap Cohort"]), JSON.stringify({ cohort: { cheap: true } }), new Date().toISOString(), "INBOX");

    const submissionsMock = {
      filings: {
        recent: {
          accessionNumber: ["0001067983-23-000001"],
          form: ["13F-HR"],
          filingDate: ["2023-05-15"],
          reportDate: ["2023-03-31"],
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

    const xmlMock = `<?xml version="1.0" encoding="utf-8"?>
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
</informationTable>`;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("submissions")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(submissionsMock),
          json: async () => submissionsMock,
        } as any;
      }
      if (url.includes("index.json")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(indexMock),
          json: async () => indexMock,
        } as any;
      }
      if (url.includes("infotable.xml")) {
        return {
          ok: true,
          status: 200,
          text: async () => xmlMock,
          json: async () => ({}),
        } as any;
      }
      return { ok: false, status: 404, text: async () => "" } as any;
    });

    try {
      const outcome = await holdingsJob!.run();
      expect(outcome.ok).toBe(true);

      const stored = db.prepare('SELECT * FROM "InstitutionalHolding"').all() as any[];

      // Verify holdings are inserted
      expect(stored).toHaveLength(9);
      expect(stored[0].filerCik).toBe("0001067983"); // Berkshire
      expect(stored[0].cusip).toBe("037833100");
      expect(stored[0].value).toBe(1500); // 1500000 / 1000 (divided since post 2023)

      // Verify Candidate AAPL is updated with superinvestor tag and qualification
      const candidate = db.prepare('SELECT * FROM "Candidate" WHERE "symbol"=?').get("AAPL") as any;
      expect(candidate).toBeDefined();
      
      const tags = JSON.parse(candidate.triggerTags);
      expect(tags).toContain("superinvestor");
      expect(tags).toContain("Cheap Cohort"); // shouldn't be overwritten

      const qual = JSON.parse(candidate.qualification);
      expect(qual.superinvestor).toBeDefined();
      expect(qual.superinvestor.count).toBe(9); // 9 filers held it in our mock
      expect(qual.superinvestor.holders[0].name).toBe("Berkshire Hathaway Inc");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});


