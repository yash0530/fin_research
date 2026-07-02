import { describe, it, expect } from "vitest";
import { claimIsCited, dropUncited, validateVerdict } from "./evidence-validation";
import { classify, ANALYZERS } from "./analyzers";
import type { Claim, Verdict } from "./schemas";

describe("evidence-validation", () => {
  const citable = ["fundamentals", "qoe"];

  it("keeps claims citing a known tool or a paste ref; drops the rest", () => {
    expect(claimIsCited({ claim: "a", evidence_refs: ["fundamentals"], confidence: "high" }, citable)).toBe(true);
    expect(claimIsCited({ claim: "b", evidence_refs: ["paste:42"], confidence: "low" }, citable)).toBe(true);
    expect(claimIsCited({ claim: "c", evidence_refs: ["rumor"], confidence: "low" }, citable)).toBe(false);
    expect(claimIsCited({ claim: "d", evidence_refs: [], confidence: "low" }, citable)).toBe(false);
  });

  it("dropUncited filters a claim list", () => {
    const claims: Claim[] = [
      { claim: "keep", evidence_refs: ["qoe"], confidence: "high" },
      { claim: "drop", evidence_refs: ["hearsay"], confidence: "low" },
    ];
    expect(dropUncited(claims, citable).map((c) => c.claim)).toEqual(["keep"]);
  });

  it("validateVerdict cleans bull/bear and reports counts", () => {
    const v: Verdict = {
      summary: "x",
      recommendation: "BUY",
      conviction: "LOW",
      bull_case: [
        { claim: "ok", evidence_refs: ["fundamentals"], confidence: "high" },
        { claim: "bad", evidence_refs: [], confidence: "low" },
      ],
      bear_case: [{ claim: "nope", evidence_refs: ["vibes"], confidence: "low" }],
      what_would_change_mind: [],
      target_price_range: { low: 1, high: 2, timeframe: "12m" },
      trade_plan: { position_size_pct: 1, stop_price: null, rationale: "" },
    };
    const { verdict, report } = validateVerdict(v, citable);
    expect(verdict.bull_case).toHaveLength(1);
    expect(verdict.bear_case).toHaveLength(0);
    expect(report).toEqual({ droppedBull: 1, droppedBear: 1 });
  });
});

describe("classify", () => {
  it("maps GICS + AI-lens codes to the right analyzer, else generic", () => {
    expect(classify("JPM", "g_financials").key).toBe("banks");
    expect(classify("MU", "ai_memory").key).toBe("semis");
    expect(classify("XOM", "g_energy").key).toBe("energy");
    expect(classify("O", "ai_datacenter_reit").key).toBe("reits");
    expect(classify("WAT").key).toBe("generic"); // no code
    expect(classify("ZZZ", "unknown_code").key).toBe("generic");
  });

  it("every analyzer declares tools and a prompt prefix", () => {
    for (const a of Object.values(ANALYZERS)) {
      expect(a.requiredTools.length).toBeGreaterThan(0);
      expect(a.promptPrefix.length).toBeGreaterThan(0);
    }
  });
});
