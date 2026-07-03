import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { SqlDb } from "../db/migrate";
import { applyMigrations } from "../db/migrate";
import {
  emptyMemo,
  loadActiveMemo,
  stageMemoDelta,
  applyMemoVersion,
  rejectMemoVersion,
  listMemoVersions,
  stagedMemoVersions,
} from "./memo-store";
import type { MemoDelta } from "./schemas";

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

const delta = (sections: Record<string, string>, summary = "s"): MemoDelta => ({
  delta_summary: summary,
  sections,
});

describe("living-memo store", () => {
  let d: SqlDb;
  beforeEach(() => {
    d = db();
  });

  it("stages a delta as a staged MemoVersion, merged onto the empty scaffold", () => {
    const id = stageMemoDelta(d, "mu", delta({ moat: "HBM lead" }), "dsr1");
    expect(id).not.toBeNull();
    const staged = stagedMemoVersions(d);
    expect(staged).toHaveLength(1);
    expect(JSON.parse(staged[0].contentJson).moat).toBe("HBM lead");
    expect(loadActiveMemo(d, "MU")).toBeNull(); // NOT applied — human-gated
  });

  it("ignores unknown sections and no-op deltas", () => {
    expect(stageMemoDelta(d, "MU", delta({ not_a_section: "x" }), "dsr1")).toBeNull();
    expect(stageMemoDelta(d, "MU", delta({ moat: "   " }), "dsr1")).toBeNull();
    expect(stagedMemoVersions(d)).toHaveLength(0);
  });

  it("apply promotes staged→active, updates the Memo head, supersedes the prior active", () => {
    const v1 = stageMemoDelta(d, "MU", delta({ moat: "v1 moat" }), "dsr1")!;
    expect(applyMemoVersion(d, v1)).toBe(true);
    expect(loadActiveMemo(d, "MU")?.moat).toBe("v1 moat");

    // A second dossier carries the moat forward and adds a risk.
    const v2 = stageMemoDelta(d, "MU", delta({ risk_register: "cyclicality" }), "dsr2")!;
    const merged = JSON.parse(listMemoVersions(d, "MU").find((x) => x.id === v2)!.contentJson);
    expect(merged.moat).toBe("v1 moat"); // carried forward from active
    expect(merged.risk_register).toBe("cyclicality");

    expect(applyMemoVersion(d, v2)).toBe(true);
    const versions = listMemoVersions(d, "MU");
    expect(versions.find((x) => x.id === v1)!.state).toBe("superseded");
    expect(versions.find((x) => x.id === v2)!.state).toBe("active");
    expect(loadActiveMemo(d, "MU")?.risk_register).toBe("cyclicality");
  });

  it("apply is a no-op on a non-staged id; reject only affects staged", () => {
    const v1 = stageMemoDelta(d, "MU", delta({ moat: "x" }), "dsr1")!;
    applyMemoVersion(d, v1);
    expect(applyMemoVersion(d, v1)).toBe(false); // already active
    expect(rejectMemoVersion(d, v1)).toBe(false); // not staged
    const v2 = stageMemoDelta(d, "MU", delta({ moat: "y" }), "dsr2")!;
    expect(rejectMemoVersion(d, v2)).toBe(true);
    expect(listMemoVersions(d, "MU").find((x) => x.id === v2)!.state).toBe("rejected");
  });

  it("emptyMemo has all 10 sections", () => {
    expect(Object.keys(emptyMemo())).toHaveLength(10);
  });
});
