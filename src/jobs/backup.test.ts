import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { applyMigrations, type SqlDb } from "../db/migrate";
import { readFileSync } from "node:fs";
import { listBackups, pruneBackups, backupFileName, runBackupJob } from "./backup";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const INIT = readFileSync("prisma/migrations/0001_init.sql", "utf8");

const tmpDirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "engine-backup-"));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, [{ name: "0001_init", sql: INIT }]);
  return db;
}

describe("backup retention", () => {
  it("lists only dated engine backups, oldest→newest, ignoring other files", () => {
    const dir = tempDir();
    for (const name of ["engine-2026-06-01.db", "engine-2026-06-03.db", "engine-2026-06-02.db", "notes.txt", "engine.db"]) {
      writeFileSync(join(dir, name), "x");
    }
    expect(listBackups(dir)).toEqual(["engine-2026-06-01.db", "engine-2026-06-02.db", "engine-2026-06-03.db"]);
  });

  it("keeps the newest N and deletes the oldest", () => {
    const dir = tempDir();
    // 20 consecutive days.
    for (let day = 1; day <= 20; day++) {
      writeFileSync(join(dir, `engine-2026-06-${String(day).padStart(2, "0")}.db`), "x");
    }
    const removed = pruneBackups(dir, 14);
    expect(removed).toHaveLength(6); // 20 - 14
    expect(removed[0]).toBe("engine-2026-06-01.db"); // oldest removed first
    const kept = listBackups(dir);
    expect(kept).toHaveLength(14);
    expect(kept[0]).toBe("engine-2026-06-07.db"); // newest 14 (07..20)
    expect(kept[kept.length - 1]).toBe("engine-2026-06-20.db");
  });

  it("is a no-op when at or under the retention count", () => {
    const dir = tempDir();
    for (let day = 1; day <= 5; day++) {
      writeFileSync(join(dir, `engine-2026-06-0${day}.db`), "x");
    }
    expect(pruneBackups(dir, 14)).toEqual([]);
    expect(listBackups(dir)).toHaveLength(5);
  });

  it("missing directory ⇒ empty listing, never throws", () => {
    expect(listBackups(join(tmpdir(), "does-not-exist-engine-xyz"))).toEqual([]);
  });
});

describe("runBackupJob", () => {
  it("VACUUM INTO writes a dated backup file and prunes to keep", () => {
    const dir = tempDir();
    const db = migratedDb();
    db.prepare('INSERT INTO "Ticker" ("symbol") VALUES (?)').run("MU");
    const date = new Date("2026-07-02T12:00:00Z");
    const detail = runBackupJob(db, { dir, keep: 14, now: () => date });
    const expected = join(dir, "engine-2026-07-02.db");
    expect(existsSync(expected)).toBe(true);
    expect(detail).toContain(expected);
    // The backup is a real SQLite file with our row.
    const restored = new DatabaseSync(expected) as unknown as SqlDb;
    const row = restored.prepare('SELECT "symbol" FROM "Ticker"').get() as { symbol: string };
    expect(row.symbol).toBe("MU");
  });

  it("same-day re-run overwrites (idempotent, never errors on an existing file)", () => {
    const dir = tempDir();
    const db = migratedDb();
    const date = new Date("2026-07-02T12:00:00Z");
    const first = runBackupJob(db, { dir, now: () => date });
    const second = runBackupJob(db, { dir, now: () => date });
    expect(first).not.toContain("failed");
    expect(second).not.toContain("failed");
    expect(readdirSync(dir).filter((f) => f.startsWith("engine-"))).toEqual(["engine-2026-07-02.db"]);
  });

  it("backupFileName is the market date", () => {
    expect(backupFileName(new Date("2026-07-02T23:59:00Z"))).toBe("engine-2026-07-02.db");
  });
});
