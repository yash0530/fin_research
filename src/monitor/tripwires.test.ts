import { describe, it, expect } from "vitest";
import {
  ruleAppliesToSymbol,
  filingEventSeverity,
  surfaceAlerts,
  alertsForSymbol,
  evaluateTripwiresPure,
  type FilingEventRow,
} from "./tripwires";
import { TRIPWIRES } from "../config/tripwires";
import type { TripwireRule } from "../rules/types";

const muRule = TRIPWIRES.find((r) => r.id === "mu_drawdown_20")!;
const ddr5Rule = TRIPWIRES.find((r) => r.id === "ddr5_two_down")!;
const capexRule = TRIPWIRES.find((r) => r.id === "capex_guide_cut")!;

const AI_MEMORY = [{ code: "ai_memory", taxonomy: "ai_infra" }];
const AI_INFRA_ONLY = [{ code: "ai_networking", taxonomy: "ai_infra" }];
const GICS_ONLY = [{ code: "g_energy", taxonomy: "gics" }];

function filingEvent(over: Partial<FilingEventRow>): FilingEventRow {
  return {
    symbol: "MU",
    accessionNo: "0001-24-000001",
    form: "8-K",
    item: "2.02",
    kind: "results/guidance",
    headline: "Item 2.02: Results/Guidance",
    snippet: "",
    severity: "info",
    filedAt: "2026-06-30",
    ...over,
  };
}

describe("ruleAppliesToSymbol", () => {
  it("symbol-scoped rules match only their symbol", () => {
    expect(ruleAppliesToSymbol(muRule, "MU", GICS_ONLY)).toBe(true);
    expect(ruleAppliesToSymbol(muRule, "SNDK", AI_MEMORY)).toBe(false);
  });

  it("memory-cycle series rules scope to ai_memory members", () => {
    expect(ruleAppliesToSymbol(ddr5Rule, "MU", AI_MEMORY)).toBe(true);
    expect(ruleAppliesToSymbol(ddr5Rule, "NVDA", AI_INFRA_ONLY)).toBe(false);
  });

  it("capex/credit proxies scope to the ai_infra taxonomy", () => {
    expect(ruleAppliesToSymbol(capexRule, "NVDA", AI_INFRA_ONLY)).toBe(true);
    expect(ruleAppliesToSymbol(capexRule, "XOM", GICS_ONLY)).toBe(false);
  });
});

describe("filingEventSeverity", () => {
  it("8-K item 4.02 is ALWAYS critical, whatever was stored", () => {
    expect(filingEventSeverity(filingEvent({ item: "4.02", severity: "info" }))).toBe("critical");
  });

  it("filing-diff events map by LLM verdict", () => {
    expect(filingEventSeverity(filingEvent({ kind: "filing-diff", severity: "thesis-relevant" }))).toBe("critical");
    expect(filingEventSeverity(filingEvent({ kind: "filing-diff", severity: "notable" }))).toBe("warn");
    expect(filingEventSeverity(filingEvent({ kind: "filing-diff", severity: "routine" }))).toBe("info");
  });
});

describe("surfaceAlerts", () => {
  const baseInput = {
    symbols: ["MU", "AAPL"],
    sectorsBySymbol: { MU: AI_MEMORY, AAPL: GICS_ONLY },
    rules: TRIPWIRES as TripwireRule[],
  };

  it("maps rule events onto matching symbols only", () => {
    const alerts = surfaceAlerts({
      ...baseInput,
      ruleEvents: [{ ruleId: "mu_drawdown_20", severity: "warn", message: "MU is -22% off", firedAt: "2026-07-01" }],
      filingEvents: [],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ symbol: "MU", severity: "warn", source: "rule" });
  });

  it("unmatched macro events surface once with symbol null", () => {
    const alerts = surfaceAlerts({
      symbols: ["AAPL"],
      sectorsBySymbol: { AAPL: GICS_ONLY },
      rules: TRIPWIRES as TripwireRule[],
      ruleEvents: [{ ruleId: "capex_guide_cut", severity: "critical", message: "capex cut", firedAt: "2026-07-01" }],
      filingEvents: [],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].symbol).toBeNull();
    expect(alerts[0].severity).toBe("critical");
  });

  it("4.02 filings always surface critical; routine diffs are suppressed; criticals sort first", () => {
    const alerts = surfaceAlerts({
      ...baseInput,
      ruleEvents: [{ ruleId: "mu_drawdown_20", severity: "warn", message: "dd", firedAt: "2026-07-01" }],
      filingEvents: [
        filingEvent({ item: "4.02", kind: "non-reliance", severity: "info" }),
        filingEvent({ accessionNo: "acc-diff-1", item: "diff", kind: "filing-diff", severity: "routine" }),
        filingEvent({ accessionNo: "acc-diff-2", item: "diff", kind: "filing-diff", severity: "notable", symbol: "AAPL" }),
      ],
    });
    expect(alerts.map((a) => a.severity)).toEqual(["critical", "warn", "warn"]);
    const critical = alerts[0];
    expect(critical.source).toBe("filing");
    expect(critical.symbol).toBe("MU");
    // routine diff suppressed
    expect(alerts.some((a) => a.id.includes("diff") && a.symbol === "MU")).toBe(false);
  });

  it("ignores filing events for symbols outside the held+watchlist scope", () => {
    const alerts = surfaceAlerts({
      ...baseInput,
      ruleEvents: [],
      filingEvents: [filingEvent({ symbol: "XOM", item: "4.02" })],
    });
    expect(alerts).toHaveLength(0);
  });
});

describe("alertsForSymbol", () => {
  it("returns only alerts scoped to the one symbol", () => {
    const alerts = alertsForSymbol(
      "MU",
      AI_MEMORY,
      [
        { ruleId: "mu_drawdown_20", severity: "warn", message: "dd", firedAt: "2026-07-01" },
        { ruleId: "ddr5_two_down", severity: "warn", message: "ddr5", firedAt: "2026-07-01" },
        { ruleId: "sndk_drawdown_25", severity: "warn", message: "sndk", firedAt: "2026-07-01" },
      ],
      [filingEvent({ item: "4.02" })],
      TRIPWIRES,
    );
    expect(alerts.map((a) => a.id).sort()).toEqual(["8-K-4.02", "ddr5_two_down", "mu_drawdown_20"]);
  });
});

describe("evaluateTripwiresPure", () => {
  it("fires a drawdown rule over injected closes and compounds in the same pass", async () => {
    const closes = [
      ...Array.from({ length: 10 }, (_, i) => ({ d: `2026-06-${String(i + 1).padStart(2, "0")}`, close: 100 })),
      { d: "2026-06-20", close: 70 },
    ];
    const fired = await evaluateTripwiresPure(TRIPWIRES, {
      today: "2026-07-01",
      closesBySymbol: { MU: closes, SNDK: [], HYG: [], IEF: [] },
      seriesByName: {
        ddr5_contract_mom: [
          { d: "2026-06-30", value: -2.1 },
          { d: "2026-05-31", value: -1.4 },
        ],
        capex_flag: [],
      },
    });
    const ids = fired.map((f) => f.id);
    expect(ids).toContain("mu_drawdown_20"); // -30% ≤ -20%
    expect(ids).toContain("ddr5_two_down"); // two down months
    expect(ids).toContain("memory_exit"); // compound: ddr5 fired, no capex_raise
    expect(ids).not.toContain("sndk_drawdown_25"); // no data → no fire, no crash
  });

  it("never crashes on missing series/closes", async () => {
    const fired = await evaluateTripwiresPure(TRIPWIRES, {
      today: "2026-07-01",
      closesBySymbol: {},
      seriesByName: {},
    });
    expect(fired).toEqual([]);
  });
});
