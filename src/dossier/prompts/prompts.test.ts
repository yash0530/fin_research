import { describe, it, expect } from "vitest";
import * as planner from "./planner";
import * as bull from "./bull";
import * as bear from "./bear";
import * as rebuttal from "./rebuttal";
import * as judge from "./judge";
import * as critique from "./critique";
import * as memo from "./memo";

// A sentinel evidence block: every user builder must embed the evidence it is given.
const EV = "EVIDENCE_SENTINEL_1234567890";

describe("prompt modules — shape", () => {
  const modules: Array<{ name: string; mod: { system: string; user: (a: never) => string } }> = [
    { name: "planner", mod: planner as never },
    { name: "bull", mod: bull as never },
    { name: "bear", mod: bear as never },
    { name: "rebuttal", mod: rebuttal as never },
    { name: "judge", mod: judge as never },
    { name: "critique", mod: critique as never },
    { name: "memo", mod: memo as never },
  ];

  it("every module exports a non-empty system string and a user builder function", () => {
    for (const { name, mod } of modules) {
      expect(typeof mod.system, name).toBe("string");
      expect(mod.system.trim().length, name).toBeGreaterThan(0);
      expect(typeof mod.user, name).toBe("function");
    }
  });
});

describe("judge prompt — conviction rubric", () => {
  it("system text contains the HIGH/MEDIUM/LOW conviction conditions", () => {
    const s = judge.system;
    expect(s).toContain("HIGH");
    expect(s).toContain("MEDIUM");
    expect(s).toContain("LOW");
    // each tier states its condition, not just the label
    expect(s).toMatch(/HIGH:.*bear/i);
    expect(s).toMatch(/MEDIUM:.*unresolved/i);
    expect(s).toMatch(/LOW:.*research/i);
  });

  it("mentions what_would_change_mind (falsifiability)", () => {
    expect(judge.system + judge.user({
      symbol: "MU",
      promptPrefix: "",
      currentPrice: 100,
      evidence: EV,
      bullMd: "b",
      bearAttackMd: "a",
      independentBearMd: "i",
      rebuttalMd: "r",
    })).toContain("what_would_change_mind");
  });
});

describe("bear prompt — attack AND independent case", () => {
  it("demands both an attack on the bull case and an independent bear case", () => {
    const s = bear.system;
    expect(s).toMatch(/attack/i);
    expect(s).toMatch(/independent/i);
    const u = bear.user({ symbol: "MU", promptPrefix: "", bullThesisMd: "bull", evidence: EV });
    expect(u).toContain("attack_md");
    expect(u).toContain("independent_bear_md");
  });
});

describe("memo prompt — names all 10 Living Memo sections", () => {
  const SECTIONS = [
    "identity",
    "moat",
    "long_term_thesis",
    "current_state",
    "management_track_record",
    "risk_register",
    "open_questions",
    "recent_observations",
    "past_verdicts",
    "anti_thesis",
  ];
  it("memo.MEMO_SECTIONS lists exactly the 10 canonical sections", () => {
    expect([...memo.MEMO_SECTIONS]).toEqual(SECTIONS);
  });
  it("the memo system prompt names every section", () => {
    for (const name of SECTIONS) expect(memo.system).toContain(name);
  });
});

describe("user builders — include the evidence block they are given", () => {
  it("planner", () => {
    expect(
      planner.user({ symbol: "MU", promptPrefix: "", requiredTools: ["fundamentals"], iteration: 0, toolCatalog: "cat", evidence: EV }),
    ).toContain(EV);
  });
  it("bull", () => {
    expect(bull.user({ symbol: "MU", promptPrefix: "", evidence: EV })).toContain(EV);
  });
  it("bear", () => {
    expect(bear.user({ symbol: "MU", promptPrefix: "", bullThesisMd: "b", evidence: EV })).toContain(EV);
  });
  it("rebuttal", () => {
    expect(
      rebuttal.user({ symbol: "MU", bullThesisMd: "b", bearAttackMd: "a", independentBearMd: "i", evidence: EV }),
    ).toContain(EV);
  });
  it("judge", () => {
    expect(
      judge.user({ symbol: "MU", promptPrefix: "", currentPrice: 100, evidence: EV, bullMd: "b", bearAttackMd: "a", independentBearMd: "i", rebuttalMd: "r" }),
    ).toContain(EV);
  });
  it("critique", () => {
    expect(critique.user({ symbol: "MU", verdictJson: "{}", evidence: EV })).toContain(EV);
  });
  it("memo", () => {
    expect(memo.user({ symbol: "MU", verdictJson: "{}", evidence: EV })).toContain(EV);
  });
});

describe("Living-Memo context — planner + judge (donor fidelity)", () => {
  const MEMO = "MEMO_SENTINEL_moat_is_widening";
  const judgeArgs = {
    symbol: "MU",
    promptPrefix: "",
    currentPrice: 100,
    evidence: EV,
    bullMd: "b",
    bearAttackMd: "a",
    independentBearMd: "i",
    rebuttalMd: "r",
  };
  const plannerArgs = {
    symbol: "MU",
    promptPrefix: "",
    requiredTools: [],
    iteration: 0,
    toolCatalog: "cat",
    evidence: EV,
  };

  it("judge user embeds the memo summary when provided", () => {
    expect(judge.user({ ...judgeArgs, memoSummary: MEMO })).toContain(MEMO);
  });
  it("planner user embeds the memo summary when provided", () => {
    expect(planner.user({ ...plannerArgs, memoSummary: MEMO })).toContain(MEMO);
  });
  it("both fall back to an explicit '(no prior memo)' marker", () => {
    expect(judge.user(judgeArgs)).toContain("(no prior memo)");
    expect(planner.user(plannerArgs)).toContain("(no prior memo)");
  });
});
