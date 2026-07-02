import { describe, it, expect, beforeEach } from "vitest";
import { withLlmLock, _resetLocks } from "./singleflight";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withLlmLock", () => {
  beforeEach(() => _resetLocks());

  it("serializes calls on the same endpoint", async () => {
    const order: string[] = [];
    const a = withLlmLock("ep1", async () => {
      order.push("start A");
      await delay(30);
      order.push("end A");
    });
    const b = withLlmLock("ep1", async () => {
      order.push("start B");
      await delay(1);
      order.push("end B");
    });
    await Promise.all([a, b]);
    // B must not start until A has fully ended.
    expect(order).toEqual(["start A", "end A", "start B", "end B"]);
  });

  it("runs different endpoints concurrently", async () => {
    const order: string[] = [];
    const a = withLlmLock("epA", async () => {
      order.push("start A");
      await delay(30);
      order.push("end A");
    });
    const b = withLlmLock("epB", async () => {
      order.push("start B");
      await delay(1);
      order.push("end B");
    });
    await Promise.all([a, b]);
    // B (fast, different endpoint) finishes before A — proves concurrency.
    expect(order.indexOf("start B")).toBeLessThan(order.indexOf("end A"));
    expect(order.indexOf("end B")).toBeLessThan(order.indexOf("end A"));
  });

  it("does not let one rejection poison the queue", async () => {
    const results: string[] = [];
    const failing = withLlmLock("ep1", async () => {
      throw new Error("boom");
    });
    await expect(failing).rejects.toThrow("boom");
    const ok = await withLlmLock("ep1", async () => {
      results.push("ran after failure");
      return 42;
    });
    expect(ok).toBe(42);
    expect(results).toEqual(["ran after failure"]);
  });
});
