import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { SqlDb } from "../db/migrate";
import { applyMigrations } from "../db/migrate";
import { upsertTicker, insertPrices, activeSymbols } from "../db/queries";
import { staleSymbols, runUniverseCheck } from "./universe";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const ALL = readdirSync("prisma/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((name) => ({ name: name.replace(/\.sql$/, ""), sql: readFileSync(join("prisma/migrations", name), "utf8") }));

function db(): SqlDb {
  const d = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(d, ALL);
  return d;
}

describe("staleSymbols (pure)", () => {
  const latest = [
    { symbol: "FRESH", d: "2026-07-01" },
    { symbol: "OLD", d: "2026-05-01" },
  ];
  it("flags symbols lagging maxDate beyond the window, and no-bar symbols", () => {
    const out = staleSymbols(["FRESH", "OLD", "NOBAR"], latest, "2026-07-02", 14);
    expect(out.sort()).toEqual(["NOBAR", "OLD"]);
  });
  it("keeps everything fresh under the window", () => {
    expect(staleSymbols(["FRESH"], latest, "2026-07-02", 14)).toEqual([]);
  });
});

describe("runUniverseCheck", () => {
  let d: SqlDb;
  beforeEach(() => {
    d = db();
    upsertTicker(d, { symbol: "LIVE", name: "Live" });
    upsertTicker(d, { symbol: "DEAD", name: "Delisted" });
    upsertTicker(d, { symbol: "WATCHED", name: "Watched but stale" });
    d.prepare(`UPDATE Ticker SET watchlisted=1 WHERE symbol='WATCHED'`).run();
    insertPrices(d, [
      { symbol: "LIVE", d: "2026-07-02", close: 100 },
      { symbol: "DEAD", d: "2026-01-10", close: 5 },
      { symbol: "WATCHED", d: "2026-01-10", close: 5 },
    ]);
  });

  it("deactivates a stale non-watchlisted symbol, keeps live + watchlisted", () => {
    const msg = runUniverseCheck(d, { staleDays: 14 });
    expect(msg).toContain("deactivated 1");
    expect(msg).toContain("DEAD");
    expect(msg).toContain("kept 1 watchlisted");
    expect(activeSymbols(d).sort()).toEqual(["LIVE", "WATCHED"]); // DEAD gone, WATCHED spared
  });

  it("is a no-op when nothing is stale", () => {
    // Freshen DEAD so nothing lags.
    insertPrices(d, [{ symbol: "DEAD", d: "2026-07-02", close: 6 }]);
    d.prepare(`UPDATE Ticker SET watchlisted=0 WHERE symbol='WATCHED'`).run();
    insertPrices(d, [{ symbol: "WATCHED", d: "2026-07-02", close: 6 }]);
    expect(runUniverseCheck(d, { staleDays: 14 })).toContain("no stale symbols");
  });
});
