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
    settings.models.overrides = {
      narrator: "qwen_fast",
      nightly: "qwen_fast",
      monthly: "qwen_fast",
      event: "qwen_fast",
      classify: "qwen_fast",
    };
  });

  it("routes every role to the default out-of-the-box profile", () => {
    const fastRoles = new Set(["narrator", "nightly", "monthly", "event", "classify"]);
    for (const role of ALL_ROLES) {
      if (fastRoles.has(role)) {
        expect(resolveProfileName(role)).toBe("qwen_fast");
        expect(resolveProfile(role).model).toBe("qwen3.6-35b-a3b");
      } else {
        expect(resolveProfileName(role)).toBe("qwen_local");
        expect(resolveProfile(role).model).toBe("qwen3.6-27b");
      }
    }
  });

  it("repoints a single role via a sparse override (one-line config change)", () => {
    settings.models.overrides = { ...settings.models.overrides, narrator: "gemma4_local" };
    expect(resolveProfileName("narrator")).toBe("gemma4_local");
    expect(resolveProfile("narrator").baseUrl).toContain("8001");
    // Everything else still Qwen local or fast.
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
