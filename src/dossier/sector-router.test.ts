import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { applyMigrations, type SqlDb } from "../db/migrate";
import { insertSectors, upsertTicker, linkTickerSector } from "../db/queries";
import { classify, analyzerKeyForIndustry } from "./analyzers";
import { resolveSectorCode } from "./job";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const INIT = readFileSync("prisma/migrations/0001_init.sql", "utf8");

/** A migrated DB seeded with the sectors + memberships the router reads. */
function routerDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, [{ name: "0001_init", sql: INIT }]);
  insertSectors(db, [
    { code: "ai_memory", name: "Memory", taxonomy: "ai_infra", driver: 2 },
    { code: "g_info_tech", name: "Information Technology", taxonomy: "gics", driver: 0 },
    { code: "g_financials", name: "Financials", taxonomy: "gics", driver: 0 },
    { code: "g_real_estate", name: "Real Estate", taxonomy: "gics", driver: 0 },
    { code: "g_energy", name: "Energy", taxonomy: "gics", driver: 0 },
  ]);
  // MU: both a GICS info-tech link AND the AI-lens memory link (the live case).
  upsertTicker(db, { symbol: "MU", name: "Micron" });
  linkTickerSector(db, "MU", "g_info_tech");
  linkTickerSector(db, "MU", "ai_memory");
  upsertTicker(db, { symbol: "JPM", name: "JPMorgan" });
  linkTickerSector(db, "JPM", "g_financials");
  upsertTicker(db, { symbol: "O", name: "Realty Income" });
  linkTickerSector(db, "O", "g_real_estate");
  upsertTicker(db, { symbol: "XOM", name: "Exxon" });
  linkTickerSector(db, "XOM", "g_energy");
  upsertTicker(db, { symbol: "ZZZ", name: "No Sector Co" }); // no memberships
  return db;
}

describe("DB-aware sector router (resolveSectorCode → classify)", () => {
  it("routes MU to semis via its ai_memory membership (not generic)", () => {
    const db = routerDb();
    const code = resolveSectorCode(db, "MU");
    expect(code).toBe("ai_memory");
    expect(classify("MU", code).key).toBe("semis");
  });

  it("prefers the AI-infra lens over the GICS link when both are present", () => {
    const db = routerDb();
    // MU has g_info_tech (→semis) and ai_memory (→semis); the ai_infra tier wins.
    expect(resolveSectorCode(db, "MU")).toBe("ai_memory");
  });

  it("maps JPM→banks, O→reits, XOM→energy from GICS memberships", () => {
    const db = routerDb();
    expect(classify("JPM", resolveSectorCode(db, "JPM")).key).toBe("banks");
    expect(classify("O", resolveSectorCode(db, "O")).key).toBe("reits");
    expect(classify("XOM", resolveSectorCode(db, "XOM")).key).toBe("energy");
  });

  it("falls through to generic for a symbol with no sector data", () => {
    const db = routerDb();
    expect(resolveSectorCode(db, "ZZZ")).toBeUndefined();
    expect(classify("ZZZ", resolveSectorCode(db, "ZZZ")).key).toBe("generic");
  });

  it("honours an explicit seed sectorCode that already maps", () => {
    const db = routerDb();
    // Even with no DB membership, a caller-supplied mapped code is respected.
    expect(resolveSectorCode(db, "ZZZ", "g_energy")).toBe("g_energy");
  });

  it("industry-string backstop maps a semiconductors sub-industry to semis", () => {
    expect(analyzerKeyForIndustry("Semiconductors & Semiconductor Equipment")).toBe("semis");
    expect(classify("XYZ", undefined, "Semiconductor Materials").key).toBe("semis");
  });
});
