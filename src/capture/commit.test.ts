import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SqlDb } from "../db/migrate";
import { applyMigrations } from "../db/migrate";
import { insertCapture, setCaptureOutput, loadCapture, commitCapture } from "./commit";
import type { CaptureItem } from "./parse";

function freshDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  const migrations = readdirSync("prisma/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name: name.replace(/\.sql$/, ""), sql: readFileSync(join("prisma/migrations", name), "utf8") }));
  applyMigrations(db, migrations);
  return db;
}

const ITEMS: CaptureItem[] = [
  { kind: "claim", ticker: "NVDA", text: "HBM4 qualified at two hyperscalers", confidence: "medium" },
  { kind: "catalyst", ticker: "ZZZZ", text: "Analyst day with capex guidance", asOf: "2026-07-20" },
  { kind: "risk", text: "Export controls tightening (no ticker)" },
];

describe("capture commit path", () => {
  let db: SqlDb;
  beforeEach(() => {
    db = freshDb();
    db.prepare(`INSERT INTO Ticker (symbol, name) VALUES ('NVDA', 'NVIDIA')`).run();
  });

  it("insert → output → load round-trips the Capture row", () => {
    const id = insertCapture(db, "ticker_check", "PROMPT TEXT");
    setCaptureOutput(db, id, "RAW REPLY", "json");
    const row = loadCapture(db, id);
    expect(row?.templateKey).toBe("ticker_check");
    expect(row?.rawOutput).toBe("RAW REPLY");
    expect(row?.parseStatus).toBe("json");
  });

  it("commits evidence for every item, discovery only for unknown tickers, catalysts when dated", () => {
    const id = insertCapture(db, "daily_scan", "P");
    const s = commitCapture(db, id, ITEMS);
    expect(s).toEqual({ evidence: 3, discoveries: 1, catalysts: 1 });
    const ev = db.prepare(`SELECT origin, kind, symbol, captureId FROM EvidenceItem ORDER BY id`).all() as {
      origin: string;
      kind: string;
      symbol: string | null;
      captureId: number;
    }[];
    expect(ev).toHaveLength(3);
    expect(ev.every((e) => e.origin === "paste" && e.captureId === id)).toBe(true);
    expect(ev[0].symbol).toBe("NVDA"); // known ticker → evidence but NO discovery
    const disc = db.prepare(`SELECT symbol, occurrences FROM DiscoveryCandidate`).all() as {
      symbol: string;
      occurrences: number;
    }[];
    expect(disc).toEqual([{ symbol: "ZZZZ", occurrences: 1 }]);
    const cats = db.prepare(`SELECT d, symbol, captureId FROM Catalyst`).all();
    expect(cats).toEqual([{ d: "2026-07-20", symbol: "ZZZZ", captureId: id }]);
  });

  it("re-committing an unknown ticker bumps occurrences instead of duplicating", () => {
    const id = insertCapture(db, null, "P");
    commitCapture(db, id, [ITEMS[1]]);
    commitCapture(db, id, [ITEMS[1]]);
    const disc = db.prepare(`SELECT symbol, occurrences FROM DiscoveryCandidate`).all();
    expect(disc).toEqual([{ symbol: "ZZZZ", occurrences: 2 }]);
  });

  it("empty accept-set is a no-op", () => {
    const id = insertCapture(db, null, "P");
    expect(commitCapture(db, id, [])).toEqual({ evidence: 0, discoveries: 0, catalysts: 0 });
  });
});
