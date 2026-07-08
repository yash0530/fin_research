import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { type SqlDb } from "../db/migrate";
import { getBudgetConfig } from "./budget";
import { checkHardwareThrottling } from "./safety";
import { reconcileRuns } from "./reconcile";
import { OnDemandResearchRunner } from "./runner";
import { createResearchRun } from "./create";
import { FakeProvider } from "../analyst/fake-provider";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
type Db = InstanceType<typeof DatabaseSync>;

// Set up in-memory DB and apply migrations in order
function setupTestDb(): Db {
  const db = new DatabaseSync(":memory:");
  const migrationFiles = readdirSync("prisma/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(join("prisma/migrations", file), "utf8");
    // SQLite node module exec can run multiple queries if they are separated by semicolon,
    // but some migrations might have multiple statements. db.exec is perfect for this.
    db.exec(sql);
  }
  return db;
}

describe("budget config table", () => {
  it("computes correct configurations for ticker_dossier", () => {
    // Clamped low budget
    const low = getBudgetConfig("ticker_dossier", 1800); // 30 min
    expect(low.modelProfile).toBe("fast");
    expect(low.maxDebateRounds).toBe(3);
    expect(low.useFilingDiffs).toBe(false);

    // Medium budget
    const med = getBudgetConfig("ticker_dossier", 5400); // 90 min
    expect(med.modelProfile).toBe("deep");
    expect(med.maxDebateRounds).toBe(5);
    expect(med.useFilingDiffs).toBe(true);

    // High budget
    const high = getBudgetConfig("ticker_dossier", 14400); // 4 hours
    expect(high.modelProfile).toBe("deep");
    expect(high.maxDebateRounds).toBe(7);
    expect(high.useFilingDiffs).toBe(true);
    expect(high.enableAgentCrossVerification).toBe(true);
  });

  it("computes correct configurations for theme_sweep", () => {
    const low = getBudgetConfig("theme_sweep", 1800); // 30 min
    expect(low.modelProfile).toBe("fast");
    expect(low.maxTickers).toBe(10);

    const med = getBudgetConfig("theme_sweep", 5400);
    expect(med.modelProfile).toBe("deep");
    expect(med.maxTickers).toBe(25);

    const high = getBudgetConfig("theme_sweep", 14400);
    expect(high.modelProfile).toBe("deep");
    expect(high.maxTickers).toBe(50);
  });

  it("handles fallback types correctly", () => {
    const fallback = getBudgetConfig("watchlist_reunderwrite", 1800);
    expect(fallback.modelProfile).toBe("fast");
    expect(fallback.maxTickers).toBe(5);

    const fallbackHigh = getBudgetConfig("watchlist_reunderwrite", 14400);
    expect(fallbackHigh.modelProfile).toBe("deep");
    expect(fallbackHigh.maxTickers).toBe(20);
    expect(fallbackHigh.useFilingDiffs).toBe(true);
  });
});

describe("safety hardware check", () => {
  it("ignores non-darwin platforms", async () => {
    const db = setupTestDb();
    let execCalled = false;
    const execImpl = () => {
      execCalled = true;
      return "";
    };

    await checkHardwareThrottling(db as unknown as SqlDb, "r1", {
      execImpl,
      platform: "linux",
    });
    expect(execCalled).toBe(false);
    db.close();
  });

  it("triggers cool-down pause on CPU_Speed_Limit < 50", async () => {
    const db = setupTestDb();
    // Insert mock ResearchRun
    db.prepare(
      'INSERT INTO "ResearchRun" ("id", "runType", "target", "budgetSeconds", "status", "profile", "createdAt") VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
    ).run("r1", "theme_sweep", "AI", 1800, "RUNNING", "fast");

    const execImpl = (cmd: string) => {
      if (cmd.includes("therm")) {
        return "CPU_Speed_Limit = 40";
      }
      return "Now drawing from 'AC Power'";
    };

    let sleptMs = 0;
    const sleepImpl = async (ms: number) => {
      sleptMs = ms;
    };

    await checkHardwareThrottling(db as unknown as SqlDb, "r1", {
      execImpl,
      sleepImpl,
      platform: "darwin",
    });

    expect(sleptMs).toBe(30000);
    const run = db.prepare('SELECT * FROM "ResearchRun" WHERE id = ?').get("r1") as any;
    expect(run.errorMessage).toContain("Throttling: Cool-down active");
    db.close();
  });

  it("aborts run when battery < 25% on battery power", async () => {
    const db = setupTestDb();
    const execImpl = (cmd: string) => {
      if (cmd.includes("therm")) {
        return "CPU_Speed_Limit = 100";
      }
      return "Now drawing from 'Battery Power'\n -InternalBattery-0 20%; discharging;";
    };

    await expect(
      checkHardwareThrottling(db as unknown as SqlDb, "r1", {
        execImpl,
        platform: "darwin",
      })
    ).rejects.toThrow(/Battery below 25%/);
    db.close();
  });
});

describe("reconcile runs", () => {
  it("marks orphaned runs as FAILED and releases lock", () => {
    const db = setupTestDb();
    // Add running run with dead pid
    db.prepare(
      'INSERT INTO "ResearchRun" ("id", "runType", "target", "budgetSeconds", "status", "profile", "createdAt", "pid") VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'), ?)'
    ).run("r_orphaned", "theme_sweep", "AI", 1800, "RUNNING", "fast", 99999);

    // Mock processes: 99999 is dead, 88888 is alive
    const aliveImpl = (p: number) => p === 88888;
    const signals: string[] = [];
    const killImpl = (p: number, sig: string) => {
      signals.push(`${p}:${sig}`);
    };

    // Mock run lock path
    const lockPath = "data/test_reconcile.lock";
    rmSync(lockPath, { force: true });
    // create fake lockfile owned by dead pid 99999
    const lockData = {
      ownerPid: 99999,
      job: "research_run",
      startedAt: Date.now(),
      llamaPid: 77777,
    };
    const { writeFileSync, mkdirSync } = require("node:fs");
    const { dirname } = require("node:path");
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, JSON.stringify(lockData));

    reconcileRuns(db as unknown as SqlDb, {
      aliveImpl,
      killImpl,
      lockPath,
    });

    const run = db.prepare('SELECT * FROM "ResearchRun" WHERE id = ?').get("r_orphaned") as any;
    expect(run.status).toBe("FAILED");
    expect(run.errorMessage).toContain("Orphaned run");

    // Lockfile should be deleted
    expect(existsSync(lockPath)).toBe(false);
    db.close();
  });
});

describe("OnDemandResearchRunner", () => {
  it("executes happy path completely", async () => {
    const db = setupTestDb();
    createResearchRun(db as unknown as SqlDb, {
      id: "run_happy",
      runType: "theme_sweep",
      target: "g_energy",
      budgetSeconds: 1800,
      profile: "fast",
    });

    // Seed some mock prices & ticker sector links
    db.prepare('INSERT INTO "Sector" (code, name, taxonomy) VALUES (?, ?, ?)').run("g_energy", "Energy", "gics");
    db.prepare('INSERT INTO "Ticker" (symbol, active) VALUES (?, ?)').run("XOM", 1);
    db.prepare('INSERT INTO "TickerSector" (symbol, sectorCode) VALUES (?, ?)').run("XOM", "g_energy");
    db.prepare('INSERT INTO "FundamentalsQuarter" (symbol, periodEnd, operatingIncome) VALUES (?, ?, ?)')
      .run("XOM", "2026-03-31", 1000);
    db.prepare('INSERT INTO "FundamentalsQuarter" (symbol, periodEnd, operatingIncome) VALUES (?, ?, ?)')
      .run("XOM", "2026-06-30", 1200);
    db.prepare('INSERT INTO "FundamentalsQuarter" (symbol, periodEnd, operatingIncome) VALUES (?, ?, ?)')
      .run("XOM", "2026-09-30", 1100);
    db.prepare('INSERT INTO "FundamentalsQuarter" (symbol, periodEnd, operatingIncome) VALUES (?, ?, ?)')
      .run("XOM", "2026-12-31", 1300);

    const provider = new FakeProvider(["Theme summary text"]);
    const providerFor = () => provider;

    let time = 1000;
    const now = () => time;

    const runner = new OnDemandResearchRunner(db as unknown as SqlDb, "run_happy", providerFor, { now, platform: "linux" });
    await runner.execute();

    const run = db.prepare('SELECT * FROM "ResearchRun" WHERE id = ?').get("run_happy") as any;
    expect(run.status).toBe("COMPLETED");
    expect(existsSync(`data/research/run_happy.md`)).toBe(true);

    const steps = db.prepare('SELECT * FROM "ResearchRunStep" WHERE "runId" = ?').all("run_happy") as any[];
    expect(steps.length).toBe(2);
    expect(steps[0].status).toBe("COMPLETED");
    expect(steps[1].status).toBe("COMPLETED");

    rmSync(`data/research/run_happy.md`, { force: true });
    db.close();
  });

  it("handles budget-breach gracefully with TIMEOUT_GRACEFUL", async () => {
    const db = setupTestDb();
    createResearchRun(db as unknown as SqlDb, {
      id: "run_timeout",
      runType: "theme_sweep",
      target: "g_energy",
      budgetSeconds: 1000,
      profile: "fast",
    });

    const provider = new FakeProvider([]);
    const providerFor = () => provider;

    let time = 100000; // start time
    // First call gets start time. Subsequent calls advance time.
    const now = () => {
      const current = time;
      time += 450000;
      return current;
    };

    const runner = new OnDemandResearchRunner(db as unknown as SqlDb, "run_timeout", providerFor, { now, platform: "linux" });
    await runner.execute();

    const run = db.prepare('SELECT * FROM "ResearchRun" WHERE id = ?').get("run_timeout") as any;
    expect(run.status).toBe("TIMEOUT_GRACEFUL");

    const steps = db.prepare('SELECT * FROM "ResearchRunStep" WHERE "runId" = ? ORDER BY "stepIndex" ASC').all("run_timeout") as any[];
    expect(steps[0].status).toBe("COMPLETED");
    expect(steps[1].status).toBe("SKIPPED");

    rmSync(`data/research/run_timeout.md`, { force: true });
    db.close();
  });

  it("pauses execution on PAUSING signal", async () => {
    const db = setupTestDb();
    createResearchRun(db as unknown as SqlDb, {
      id: "run_paused",
      runType: "theme_sweep",
      target: "g_energy",
      budgetSeconds: 1800,
      profile: "fast",
    });

    const provider = new FakeProvider([]);
    const providerFor = () => provider;

    let time = 1000;
    const now = () => time;

    const runner = new OnDemandResearchRunner(db as unknown as SqlDb, "run_paused", providerFor, { now, platform: "linux" });

    // Mock progress to change run status to PAUSING midway
    vi.spyOn(runner as any, "planSteps").mockImplementation(() => {
      db.prepare('UPDATE "ResearchRun" SET "status" = \'PAUSING\' WHERE "id" = ?').run("run_paused");
      return [
        { name: "screens_rank", payload: { theme: "g_energy" } },
        { name: "theme_summaries", payload: { theme: "g_energy" } },
      ];
    });

    await runner.execute();

    const run = db.prepare('SELECT * FROM "ResearchRun" WHERE id = ?').get("run_paused") as any;
    expect(run.status).toBe("PAUSED");

    const steps = db.prepare('SELECT * FROM "ResearchRunStep" WHERE "runId" = ?').all("run_paused") as any[];
    // first step was pending, not run
    expect(steps[0].status).toBe("PENDING");

    rmSync(`data/research/run_paused.md`, { force: true });
    db.close();
  });
});
