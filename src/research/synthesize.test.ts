import { describe, it, expect } from "vitest";
import { synthesize, type SynthInput } from "./synthesize";

const base: SynthInput = {
  asOf: "2026-07-02",
  breadth: { pctAbove50dma: 25, advancers: 120, decliners: 380 },
  movers: [
    { symbol: "AAA", retPct: 8 },
    { symbol: "BBB", retPct: 5 },
    { symbol: "CCC", retPct: -9 },
  ],
  gicsPulse: [
    { sectorCode: "g_info_tech", retPct: 2.1 },
    { sectorCode: "g_energy", retPct: -6.4 },
  ],
  divergences: [{ sectorCode: "ai_memory", sectorRetPct: -20, hyperscalerRetPct: 15 }],
  tripwires: [{ id: "mem_exit", severity: "critical", message: "Memory exit signal", evidence: "manual:capex_flag=-1" }],
};

describe("synthesize", () => {
  it("puts a provenance string on EVERY insight", () => {
    const d = synthesize(base);
    expect(d.insights.length).toBeGreaterThan(0);
    for (const i of d.insights) {
      expect(i.evidence.length).toBeGreaterThan(0);
    }
  });

  it("headlines the critical count and keeps criticals even under a tight total cap", () => {
    const d = synthesize(base, { total: 1, perFamily: 3 });
    expect(d.headline).toMatch(/critical signal/);
    // The divergence (35pp => critical) and the tripwire are both critical and must survive.
    const criticals = d.insights.filter((i) => i.severity === "critical");
    expect(criticals.length).toBeGreaterThanOrEqual(2);
  });

  it("flags weak breadth as a warning and low breadth text", () => {
    const d = synthesize(base);
    const breadth = d.insights.find((i) => i.family === "breadth");
    expect(breadth?.severity).toBe("warn"); // 25% < 30
    expect(breadth?.text).toContain("25%");
  });

  it("classifies a >=30pp divergence as critical with pp provenance", () => {
    const d = synthesize(base);
    const div = d.insights.find((i) => i.family === "divergence");
    expect(div?.severity).toBe("critical"); // |-20 - 15| = 35pp
    expect(div?.evidence).toContain("pp");
  });

  it("caps insights per family", () => {
    const many: SynthInput = {
      asOf: "2026-07-02",
      movers: Array.from({ length: 20 }, (_, i) => ({ symbol: `S${i}`, retPct: i - 10 })),
    };
    const d = synthesize(many, { perFamily: 3, total: 20 });
    expect(d.insights.filter((i) => i.family === "movers").length).toBeLessThanOrEqual(3);
  });

  it("reports a quiet tape when there is nothing", () => {
    expect(synthesize({ asOf: "2026-07-02" }).headline).toMatch(/Quiet tape/);
  });
});

describe("synthesize — credit / catalysts / data_health / ruleEvents families", () => {
  it("flags credit stress with provenance and escalates a severe drop to critical", () => {
    const warn = synthesize({ asOf: "2026-07-02", credit: { ratioChangePct: -6 } });
    const c = warn.insights.find((i) => i.family === "credit");
    expect(c?.severity).toBe("warn");
    expect(c?.evidence).toContain("HYG/IEF");
    const severe = synthesize({ asOf: "2026-07-02", credit: { ratioChangePct: -12 } });
    expect(severe.insights.find((i) => i.family === "credit")?.severity).toBe("critical");
    // A small move does not fire.
    expect(synthesize({ asOf: "2026-07-02", credit: { ratioChangePct: -2 } }).insights.some((i) => i.family === "credit")).toBe(false);
  });

  it("surfaces only catalysts inside the next-7-day window", () => {
    const d = synthesize({
      asOf: "2026-07-02",
      catalysts: [
        { d: "2026-07-04", kind: "deadline", title: "DOE reactor target" },
        { d: "2026-07-05", kind: "earnings", symbol: "VRT", title: "Vertiv Q2" },
        { d: "2026-07-20", kind: "earnings", symbol: "MU", title: "too far out" },
        { d: "2026-06-30", kind: "past", title: "already happened" },
      ],
    });
    const cats = d.insights.filter((i) => i.family === "catalysts");
    expect(cats).toHaveLength(2);
    for (const c of cats) expect(c.evidence).toContain("catalyst dated");
  });

  it("emits data-health insights for stale prices, suspect ticks, and failed jobs", () => {
    const d = synthesize({
      asOf: "2026-07-02",
      dataHealth: { ageDays: 5, stalePriceCount: 3, suspectTicks: ["ZZZ -88% (60d)"], failedJobRuns: ["prices: timeout"] },
    });
    const dh = d.insights.filter((i) => i.family === "data_health");
    expect(dh.length).toBeGreaterThanOrEqual(3);
    for (const i of dh) expect(i.evidence.length).toBeGreaterThan(0);
    expect(dh.some((i) => i.text.includes("stale"))).toBe(true);
  });

  it("accepts persisted RuleEvents into the tripwire family with fire-date provenance", () => {
    const d = synthesize({
      asOf: "2026-07-02",
      ruleEvents: [{ ruleId: "memory_exit", severity: "critical", message: "MEMORY EXIT SIGNAL", firedAt: "2026-07-01T12:00:00.000Z" }],
    });
    const tw = d.insights.find((i) => i.family === "tripwire");
    expect(tw?.severity).toBe("critical");
    expect(tw?.evidence).toBe("tripwire memory_exit fired 2026-07-01");
    expect(d.headline).toMatch(/critical/);
  });
});
