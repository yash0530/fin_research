import { describe, it, expect } from "vitest";
import { Budget } from "./budget";
import { ToolCache, cacheKey } from "./cache";
import { ToolRegistry } from "./registry";
import type { Tool, ToolResult } from "./types";

describe("Budget", () => {
  it("exhausts on the LLM-call cap", () => {
    const b = new Budget({ maxWallClockSec: 999, maxLlmCalls: 2, maxToolCalls: 99 });
    b.chargeLlm();
    expect(b.exhausted()).toBe(false);
    b.chargeLlm();
    expect(b.exhausted()).toBe(true);
    expect(b.reason()).toContain("LLM-call cap");
  });

  it("exhausts on the tool-call cap", () => {
    const b = new Budget({ maxWallClockSec: 999, maxLlmCalls: 99, maxToolCalls: 1 });
    b.chargeTool();
    expect(b.reason()).toContain("tool-call cap");
  });

  it("exhausts on the wall-clock cap using an injectable clock", () => {
    let t = 1_000_000;
    const b = new Budget({ maxWallClockSec: 10, maxLlmCalls: 99, maxToolCalls: 99 }, () => t);
    expect(b.exhausted()).toBe(false);
    t += 11_000; // 11s later
    expect(b.exhausted()).toBe(true);
    expect(b.reason()).toContain("wall-clock");
    expect(b.snapshot().elapsedSec).toBeCloseTo(11);
  });
});

describe("ToolCache", () => {
  const mk = (v: number): ToolResult => ({
    tool: "t",
    data: { v },
    sources: [],
    confidence: "medium",
    cached: false,
  });

  it("stores/returns and marks hits as cached", () => {
    let t = 0;
    const c = new ToolCache(() => t);
    c.set("k", mk(1), 1000);
    const hit = c.get("k");
    expect(hit?.cached).toBe(true);
    expect((hit?.data as { v: number }).v).toBe(1);
  });

  it("expires entries past their TTL", () => {
    let t = 0;
    const c = new ToolCache(() => t);
    c.set("k", mk(1), 1000);
    t = 1001;
    expect(c.get("k")).toBeUndefined();
    expect(c.size()).toBe(0);
  });

  it("produces stable keys regardless of arg key order", () => {
    expect(cacheKey("dcf", { a: 1, b: 2 })).toBe(cacheKey("dcf", { b: 2, a: 1 }));
    expect(cacheKey("dcf", { a: 1 })).not.toBe(cacheKey("dcf", { a: 2 }));
  });
});

describe("ToolRegistry", () => {
  const t = (name: string): Tool => ({ name, describe: () => `desc ${name}`, run: async () => ({ data: {} }) });

  it("registers, looks up, and builds a planner catalog", () => {
    const reg = new ToolRegistry().registerAll([t("dcf"), t("qoe")]);
    expect(reg.has("dcf")).toBe(true);
    expect(reg.get("qoe")?.name).toBe("qoe");
    expect(reg.names()).toEqual(["dcf", "qoe"]);
    expect(reg.promptCatalog()).toContain("- dcf: desc dcf");
  });
});
