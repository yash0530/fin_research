import { describe, it, expect, afterEach } from "vitest";
import {
  settings,
  resolveProfileName,
  resolveProfile,
  thinkingForRole,
  type AgentRole,
} from "./settings";

const ALL_ROLES: AgentRole[] = [
  "planner", "bull", "bear", "rebuttal", "judge", "critique",
  "memoSynth", "narrator", "classify", "nightly", "monthly", "event",
];

describe("model routing", () => {
  afterEach(() => {
    settings.models.overrides = {};
  });

  it("routes every role to the default (qwen_local) with no overrides", () => {
    for (const role of ALL_ROLES) {
      expect(resolveProfileName(role)).toBe("qwen_local");
      expect(resolveProfile(role).model).toBe("qwen3.6-27b");
    }
  });

  it("repoints a single role via a sparse override (one-line config change)", () => {
    settings.models.overrides = { narrator: "gemma4_local" };
    expect(resolveProfileName("narrator")).toBe("gemma4_local");
    expect(resolveProfile("narrator").baseUrl).toContain("8001");
    // Everything else still Qwen.
    expect(resolveProfileName("judge")).toBe("qwen_local");
  });

  it("throws on an unknown profile name", () => {
    settings.models.overrides = { judge: "does_not_exist" };
    expect(() => resolveProfile("judge")).toThrow(/no provider profile/);
  });

  it("turns thinking ON for reasoning roles, OFF for narration/synthesis", () => {
    for (const r of ["planner", "bull", "bear", "rebuttal", "judge", "critique", "classify"] as AgentRole[]) {
      expect(thinkingForRole(r)).toBe(true);
    }
    for (const r of ["narrator", "memoSynth"] as AgentRole[]) {
      expect(thinkingForRole(r)).toBe(false);
    }
  });
});
