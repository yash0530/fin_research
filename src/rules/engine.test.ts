import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  addDaysStr,
  drawdownFromCloses,
  evaluateRule,
  interpolate,
  runAllRules,
  sqlRuleContext,
  underCooloff,
} from "./engine";
import type {
  CompoundRule,
  ConsecutiveMonthlyRule,
  DrawdownRule,
  FlagEqualsRule,
  RatioChangeRule,
  RuleContext,
  TripwireRule,
} from "./types";
import { applyMigrations, type SqlDb } from "../db/migrate";
import { insertPrices, insertRuleEvent, recentRuleEvents } from "../db/queries";
import { todayStr } from "./engine";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
const INIT = readFileSync("prisma/migrations/0001_init.sql", "utf8");

const rows = (closes: number[]) =>
  closes.map((close, i) => ({ d: `day-${String(i).padStart(3, "0")}`, close }));

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    today: "2026-06-12",
    getCloses: async () => [],
    getSeriesLast: async () => [],
    seriesValueWithin: async () => false,
    ...overrides,
  };
}

const drawdownRule: DrawdownRule = {
  id: "dd",
  type: "drawdown",
  symbol: "MU",
  lookbackDays: 60,
  pct: -20,
  severity: "warn",
  cooloffDays: 7,
  message: "MU is {value}% off its 60d high",
};

describe("drawdown", () => {
  it("fires at exactly the threshold", async () => {
    const fired = await evaluateRule(drawdownRule, ctx({ getCloses: async () => rows([100, 80]) }), new Set());
    expect(fired).not.toBeNull();
    expect(fired!.value).toBe(-20);
    expect(fired!.message).toBe("MU is -20% off its 60d high");
  });

  it("does not fire above the threshold", async () => {
    const fired = await evaluateRule(drawdownRule, ctx({ getCloses: async () => rows([100, 81]) }), new Set());
    expect(fired).toBeNull();
  });

  it("skips silently with no data", async () => {
    expect(await evaluateRule(drawdownRule, ctx(), new Set())).toBeNull();
  });
});

const ddr5Rule: ConsecutiveMonthlyRule = {
  id: "ddr5",
  type: "consecutive_monthly",
  series: "ddr5_contract_mom",
  n: 2,
  direction: "down",
  severity: "warn",
  cooloffDays: 25,
  message: "down 2 months: {value}",
};

describe("consecutive_monthly", () => {
  it("fires when all n readings are negative", async () => {
    const fired = await evaluateRule(
      ddr5Rule,
      ctx({
        getSeriesLast: async () => [
          { d: "2026-06-01", value: -1.5 },
          { d: "2026-05-01", value: -2 },
        ],
      }),
      new Set(),
    );
    expect(fired).not.toBeNull();
    expect(fired!.message).toBe("down 2 months: -1.5, -2");
  });

  it("does not fire on a mixed sign", async () => {
    const fired = await evaluateRule(
      ddr5Rule,
      ctx({
        getSeriesLast: async () => [
          { d: "2026-06-01", value: -1 },
          { d: "2026-05-01", value: 2 },
        ],
      }),
      new Set(),
    );
    expect(fired).toBeNull();
  });

  it("does not fire with fewer than n readings", async () => {
    const fired = await evaluateRule(ddr5Rule, ctx({ getSeriesLast: async () => [{ d: "2026-06-01", value: -1 }] }), new Set());
    expect(fired).toBeNull();
  });

  it("supports direction up", async () => {
    const fired = await evaluateRule(
      { ...ddr5Rule, direction: "up" },
      ctx({
        getSeriesLast: async () => [
          { d: "2026-06-01", value: 2 },
          { d: "2026-05-01", value: 1 },
        ],
      }),
      new Set(),
    );
    expect(fired).not.toBeNull();
  });
});

const capexRule: FlagEqualsRule = {
  id: "capex",
  type: "flag_equals",
  series: "capex_flag",
  value: -1,
  withinDays: 35,
  severity: "critical",
  cooloffDays: 10,
  message: "capex guide-down",
};

describe("flag_equals", () => {
  it("fires when the flag exists within the window", async () => {
    const calls: unknown[] = [];
    const fired = await evaluateRule(
      capexRule,
      ctx({
        seriesValueWithin: async (series, value, withinDays) => {
          calls.push([series, value, withinDays]);
          return true;
        },
      }),
      new Set(),
    );
    expect(fired).not.toBeNull();
    expect(calls).toEqual([["capex_flag", -1, 35]]);
  });

  it("does not fire otherwise", async () => {
    expect(await evaluateRule(capexRule, ctx(), new Set())).toBeNull();
  });
});

const ratioRule: RatioChangeRule = {
  id: "credit",
  type: "ratio_change",
  a: "HYG",
  b: "IEF",
  lookbackDays: 30,
  pct: -5,
  severity: "warn",
  cooloffDays: 14,
  message: "HYG/IEF down {value}%",
};

describe("ratio_change", () => {
  it("fires when the aligned ratio drops past the threshold", async () => {
    const a = [100, 100, 100, 100, 100, 94];
    const b = [100, 100, 100, 100, 100, 100];
    const fired = await evaluateRule(ratioRule, ctx({ getCloses: async (symbol) => rows(symbol === "HYG" ? a : b) }), new Set());
    expect(fired).not.toBeNull();
    expect(fired!.value).toBe(-6);
  });

  it("skips silently with fewer than 5 shared dates", async () => {
    const fired = await evaluateRule(
      ratioRule,
      ctx({ getCloses: async (symbol) => (symbol === "HYG" ? rows([100, 50]) : rows([100, 100])) }),
      new Set(),
    );
    expect(fired).toBeNull();
  });

  it("does not fire on a small move", async () => {
    const a = [100, 100, 100, 100, 100, 98];
    const fired = await evaluateRule(ratioRule, ctx({ getCloses: async (symbol) => rows(symbol === "HYG" ? a : a.map(() => 100)) }), new Set());
    expect(fired).toBeNull();
  });
});

const memoryExit: CompoundRule = {
  id: "memory_exit",
  type: "compound",
  allOf: ["ddr5"],
  noneOf: ["never"],
  requireNotRecent: "capex_raise",
  severity: "critical",
  cooloffDays: 30,
  message: "MEMORY EXIT SIGNAL",
};

describe("compound", () => {
  it("fires when allOf fired and no recent capex raise", async () => {
    const fired = await evaluateRule(memoryExit, ctx(), new Set(["ddr5"]));
    expect(fired).not.toBeNull();
    expect(fired!.message).toBe("MEMORY EXIT SIGNAL");
  });

  it("is blocked when allOf did not fire this pass", async () => {
    expect(await evaluateRule(memoryExit, ctx(), new Set())).toBeNull();
  });

  it("is blocked by a noneOf fire", async () => {
    const fired = await evaluateRule(memoryExit, ctx(), new Set(["ddr5", "never"]));
    expect(fired).toBeNull();
  });

  it("is suppressed by a recent capex raise", async () => {
    const fired = await evaluateRule(
      memoryExit,
      ctx({ seriesValueWithin: async (series, value) => series === "capex_flag" && value === 1 }),
      new Set(["ddr5"]),
    );
    expect(fired).toBeNull();
  });
});

describe("underCooloff", () => {
  const now = new Date("2026-06-12T00:00:00Z");
  it("suppresses inside the window", () => {
    expect(underCooloff(new Date("2026-06-06T00:00:01Z"), 7, now)).toBe(true);
  });
  it("allows at exactly the boundary", () => {
    expect(underCooloff(new Date("2026-06-05T00:00:00Z"), 7, now)).toBe(false);
  });
  it("allows when never fired", () => {
    expect(underCooloff(null, 7, now)).toBe(false);
  });
});

describe("interpolate", () => {
  it("replaces only {value}", () => {
    expect(interpolate("v={value} {other}", -3.25)).toBe("v=-3.25 {other}");
    expect(interpolate("no placeholder", 1)).toBe("no placeholder");
  });
});

describe("drawdownFromCloses / addDaysStr", () => {
  it("computes drawdown-from-high and despikes via the SqlDb context", () => {
    expect(drawdownFromCloses(rows([100, 90, 80]), 60)).toBe(-20);
    expect(drawdownFromCloses(rows([100]), 60)).toBeNull();
  });
  it("adds and subtracts whole days on a YYYY-MM-DD string", () => {
    expect(addDaysStr("2026-06-12", -35)).toBe("2026-05-08");
    expect(addDaysStr("2026-06-12", 30)).toBe("2026-07-12");
  });
});

// ── DB-backed orchestration (real migrated node:sqlite DB) ────────────────────

function migratedDb(): SqlDb {
  const db = new DatabaseSync(":memory:") as unknown as SqlDb;
  applyMigrations(db, [{ name: "0001_init", sql: INIT }]);
  return db;
}

function seedManual(db: SqlDb, series: string, d: string, value: number) {
  db.prepare('INSERT OR REPLACE INTO "ManualSeries" ("series","d","value") VALUES (?,?,?)').run(series, d, value);
}

describe("runAllRules against a real DB", () => {
  const today = todayStr();

  it("fires the drawdown rule, records a RuleEvent, then cooloff-suppresses a re-run", async () => {
    const db = migratedDb();
    // MU: 100 → 70 over 260 days = -30% off high (fires the -20 drawdown rule).
    const prices = Array.from({ length: 260 }, (_, i) => ({
      symbol: "MU",
      d: addDaysStr(today, i - 260),
      close: 100 - i * (30 / 259),
    }));
    insertPrices(db, prices);
    const tripwires: TripwireRule[] = [
      { ...drawdownRule, id: "mu_dd", symbol: "MU", lookbackDays: 252, pct: -20, cooloffDays: 7 },
    ];

    const first = await runAllRules(db, tripwires, { today });
    expect(first.fired.map((f) => f.id)).toContain("mu_dd");
    expect(recentRuleEvents(db, { ruleId: "mu_dd" })).toHaveLength(1);

    // Second run within cooloff → suppressed, no new RuleEvent.
    const second = await runAllRules(db, tripwires, { today });
    expect(second.fired).toHaveLength(0);
    expect(second.suppressed).toContain("mu_dd");
    expect(recentRuleEvents(db, { ruleId: "mu_dd" })).toHaveLength(1);
  });

  it("fires the compound memory_exit only when ddr5 fired and no recent capex raise", async () => {
    const db = migratedDb();
    seedManual(db, "ddr5_contract_mom", addDaysStr(today, -1), -1.5);
    seedManual(db, "ddr5_contract_mom", addDaysStr(today, -31), -2);
    const tripwires: TripwireRule[] = [
      { ...ddr5Rule, id: "ddr5_two_down", cooloffDays: 25 },
      { ...memoryExit, id: "memory_exit", allOf: ["ddr5_two_down"], noneOf: [] },
    ];
    const run = await runAllRules(db, tripwires, { today });
    expect(run.fired.map((f) => f.id).sort()).toEqual(["ddr5_two_down", "memory_exit"]);

    // Seed a recent capex RAISE (+1) → the compound is blocked on a fresh DB.
    const db2 = migratedDb();
    seedManual(db2, "ddr5_contract_mom", addDaysStr(today, -1), -1.5);
    seedManual(db2, "ddr5_contract_mom", addDaysStr(today, -31), -2);
    seedManual(db2, "capex_flag", addDaysStr(today, -3), 1);
    const run2 = await runAllRules(db2, tripwires, { today });
    expect(run2.fired.map((f) => f.id)).toEqual(["ddr5_two_down"]);
  });

  it("dryRun evaluates without persisting", async () => {
    const db = migratedDb();
    insertRuleEvent(db, { ruleId: "seed", severity: "info", message: "x" });
    seedManual(db, "capex_flag", addDaysStr(today, -2), -1);
    const tripwires: TripwireRule[] = [{ ...capexRule, id: "capex_guide_cut" }];
    const run = await runAllRules(db, tripwires, { today, dryRun: true });
    expect(run.fired.map((f) => f.id)).toEqual(["capex_guide_cut"]);
    expect(recentRuleEvents(db, { ruleId: "capex_guide_cut" })).toHaveLength(0);
  });
});

describe("sqlRuleContext", () => {
  it("reads despiked closes and manual series from the DB", async () => {
    const db = migratedDb();
    insertPrices(db, [
      { symbol: "MU", d: "2026-06-01", close: 100 },
      { symbol: "MU", d: "2026-06-02", close: 5000 }, // bad tick
      { symbol: "MU", d: "2026-06-03", close: 102 },
    ]);
    const c = sqlRuleContext(db, { today: "2026-06-12" });
    const closes = await c.getCloses("mu", 10);
    expect(closes).toHaveLength(3);
    expect(closes[1].close).toBeLessThan(200); // despiked on read
  });
});
