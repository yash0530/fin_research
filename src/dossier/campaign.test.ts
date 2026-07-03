import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { SqlDb } from "../db/migrate";
import { applyMigrations } from "../db/migrate";
import { InMemoryDossierStore } from "./state";
import { seedCampaign, campaignCandidates } from "./campaign";
import { upsertTicker } from "../db/queries";

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

describe("calibration campaign seeder", () => {
  let d: SqlDb;
  beforeEach(() => {
    d = db();
    upsertTicker(d, { symbol: "WATCH1", name: "W1" });
    d.prepare(`UPDATE Ticker SET watchlisted = 1 WHERE symbol = 'WATCH1'`).run();
  });

  it("prioritizes the watchlist first", () => {
    expect(campaignCandidates(d)[0]).toBe("WATCH1");
  });

  it("adds up to addPerRun and never exceeds targetBacklog", () => {
    const store = new InMemoryDossierStore();
    const msg = seedCampaign(d, store, { targetBacklog: 6, addPerRun: 3, now: 1 });
    expect(msg).toContain("queued 3");
    expect(store.all().filter((x) => x.status === "queued")).toHaveLength(3);
  });

  it("stops when the backlog is full", () => {
    const store = new InMemoryDossierStore();
    seedCampaign(d, store, { targetBacklog: 3, addPerRun: 3, now: 1 });
    const msg = seedCampaign(d, store, { targetBacklog: 3, addPerRun: 3, now: 2 });
    expect(msg).toContain("backlog full");
    expect(store.all()).toHaveLength(3);
  });

  it("does not re-queue a symbol already queued (dedupe)", () => {
    const store = new InMemoryDossierStore();
    seedCampaign(d, store, { targetBacklog: 10, addPerRun: 2, now: 1 });
    const before = store.all().map((x) => x.symbol).sort();
    seedCampaign(d, store, { targetBacklog: 10, addPerRun: 2, now: 2 });
    const after = store.all().map((x) => x.symbol).sort();
    // second pass adds NEW symbols, never duplicates an active one
    expect(new Set(after).size).toBe(after.length);
    expect(after.length).toBeGreaterThan(before.length);
  });
});
