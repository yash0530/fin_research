import { describe, it, expect } from "vitest";
import { execute, isOk, type Tool } from "./types";
import { EvidenceLedger } from "./evidence-ledger";

const goodTool: Tool<{ x: number }, { doubled: number }> = {
  name: "doubler",
  describe: () => "doubles x",
  run: async (a) => ({ data: { doubled: a.x * 2 }, sources: [{ label: "arith" }], confidence: "high" }),
};

const throwingTool: Tool = {
  name: "boom",
  describe: () => "always throws",
  run: async () => {
    throw new Error("kaboom");
  },
};

describe("execute (never-throw wrapper)", () => {
  it("wraps a successful run", async () => {
    const r = await execute(goodTool, { x: 21 });
    expect(r.data.doubled).toBe(42);
    expect(r.confidence).toBe("high");
    expect(isOk(r)).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("never throws — converts a raise into an error result", async () => {
    const r = await execute(throwingTool, {});
    expect(isOk(r)).toBe(false);
    expect(r.error).toContain("kaboom");
    expect(r.confidence).toBe("low");
  });
});

describe("EvidenceLedger", () => {
  it("filters ok vs error results and exposes the citable namespace", async () => {
    const led = new EvidenceLedger("mu");
    led.add(await execute(goodTool, { x: 1 }));
    led.add(await execute(throwingTool, {}));
    led.add(await execute(goodTool, { x: 2 }));
    expect(led.size()).toBe(3);
    expect(led.okResults()).toHaveLength(2);
    expect(led.citableTools()).toEqual(["doubler"]); // boom errored → not citable
    expect(led.symbol).toBe("MU");
  });

  it("returns the latest result for a tool", async () => {
    const led = new EvidenceLedger("mu");
    led.add(await execute(goodTool, { x: 1 }));
    led.add(await execute(goodTool, { x: 5 }));
    expect((led.latestByTool("doubler")!.data as { doubled: number }).doubled).toBe(10);
    expect(led.latestByTool("missing")).toBeUndefined();
  });

  it("caps each tool block in the evidence prompt", async () => {
    const led = new EvidenceLedger("mu");
    const bigTool: Tool = {
      name: "big",
      describe: () => "big",
      run: async () => ({ data: { blob: "z".repeat(5000) } }),
    };
    led.add(await execute(bigTool, {}));
    const prompt = led.evidencePrompt(200);
    expect(prompt).toContain("truncated");
    expect(prompt).toContain("[big]");
    expect(prompt.length).toBeLessThan(600);
  });
});
