import { describe, it, expect } from "vitest";
import { runJob, runChain } from "./runner";
import { runBackfill } from "./backfill";

describe("runJob / runChain", () => {
  it("captures success detail and never throws on failure", async () => {
    expect(await runJob("ok", async () => "added 5")).toEqual({ job: "ok", ok: true, detail: "added 5" });
    const bad = await runJob("bad", async () => {
      throw new Error("network down");
    });
    expect(bad).toEqual({ job: "bad", ok: false, detail: "network down" });
  });

  it("runs a chain in order and a failed step does not abort the rest", async () => {
    const ran: string[] = [];
    const summary = await runChain([
      { name: "prices", fn: async () => { ran.push("prices"); return "ok"; } },
      { name: "news", fn: async () => { ran.push("news"); throw new Error("rss 429"); } },
      { name: "digest", fn: async () => { ran.push("digest"); return "built"; } },
    ]);
    expect(ran).toEqual(["prices", "news", "digest"]); // digest still ran after news failed
    expect(summary.ok).toBe(2);
    expect(summary.failed).toBe(1);
  });
});

describe("runBackfill", () => {
  it("catches per-item failures and completes the rest", async () => {
    const doneMarks: string[] = [];
    const errorMarks: string[] = [];
    const written: Record<string, number> = {};
    const summary = await runBackfill<number>({
      symbols: ["AAA", "BBB", "CCC"],
      isDone: () => false,
      fetchOne: async (s) => {
        if (s === "BBB") throw new Error("timeout");
        return [1, 2, 3];
      },
      write: (s, rows) => {
        written[s] = rows.length;
      },
      markDone: (s) => doneMarks.push(s),
      markError: (s) => errorMarks.push(s),
    });
    expect(summary).toEqual({ done: 2, errors: 1, skipped: 0, rows: 6 });
    expect(doneMarks).toEqual(["AAA", "CCC"]);
    expect(errorMarks).toEqual(["BBB"]);
    expect(written).toEqual({ AAA: 3, CCC: 3 });
  });

  it("is resumable — already-done symbols are skipped, not re-fetched", async () => {
    const fetched: string[] = [];
    const summary = await runBackfill<number>({
      symbols: ["AAA", "BBB"],
      isDone: (s) => s === "AAA", // AAA completed on a prior run
      fetchOne: async (s) => {
        fetched.push(s);
        return [1];
      },
      write: () => {},
      markDone: () => {},
      markError: () => {},
    });
    expect(fetched).toEqual(["BBB"]); // AAA never re-fetched
    expect(summary.skipped).toBe(1);
    expect(summary.done).toBe(1);
  });
});
