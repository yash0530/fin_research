import { describe, it, expect } from "vitest";
import {
  waitForHealth,
  startLlamaServer,
  stopLlamaServer,
  withLlamaServer,
  type FetchLike,
  type SpawnLike,
} from "./llama-lifecycle";

/** A fetch fake that reports `ok` after `okAfter` calls (simulates a warming server). */
function healthAfter(okAfter: number): { fetchImpl: FetchLike; calls: () => number } {
  let n = 0;
  return {
    fetchImpl: async () => {
      n += 1;
      return { ok: n >= okAfter };
    },
    calls: () => n,
  };
}

describe("waitForHealth", () => {
  it("resolves once /health returns ok", async () => {
    const { fetchImpl, calls } = healthAfter(3);
    await waitForHealth("http://x/health", 5_000, { fetchImpl, intervalMs: 1 });
    expect(calls()).toBe(3);
  });

  it("throws when health never comes up within the timeout", async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false });
    await expect(waitForHealth("http://x/health", 20, { fetchImpl, intervalMs: 5 })).rejects.toThrow(
      /not healthy/,
    );
  });
});

describe("startLlamaServer", () => {
  it("adopts an already-healthy server without spawning", async () => {
    let spawned = 0;
    const spawnImpl: SpawnLike = () => {
      spawned += 1;
      return { pid: 999 };
    };
    const fetchImpl: FetchLike = async () => ({ ok: true }); // healthy from the first probe
    const handle = await startLlamaServer({ fetchImpl, spawnImpl, healthUrl: "http://x/health" });
    expect(handle.adopted).toBe(true);
    expect(handle.pid).toBeNull();
    expect(spawned).toBe(0);
  });

  it("boots and waits for health when nothing is up", async () => {
    let spawned = 0;
    const spawnImpl: SpawnLike = () => {
      spawned += 1;
      return { pid: 4242, unref: () => {} };
    };
    // unhealthy on the pre-boot probe, then healthy after the spawn.
    const { fetchImpl } = healthAfter(2);
    const handle = await startLlamaServer({
      fetchImpl,
      spawnImpl,
      healthUrl: "http://x/health",
      bootTimeoutMs: 5_000,
    });
    expect(spawned).toBe(1);
    expect(handle.adopted).toBe(false);
    expect(handle.pid).toBe(4242);
  });

  it("passes profile to llamaLaunchArgv", async () => {
    let capturedArgs: string[] = [];
    const spawnImpl: SpawnLike = (_cmd, args) => {
      capturedArgs = args;
      return { pid: 4242, unref: () => {} };
    };
    const { fetchImpl } = healthAfter(2);
    await startLlamaServer({
      profile: "fast",
      fetchImpl,
      spawnImpl,
      healthUrl: "http://x/health",
      bootTimeoutMs: 5_000,
    });
    expect(capturedArgs.join(" ")).toContain("qwen3.6-35b-a3b");
    expect(capturedArgs.join(" ")).toContain("--spec-draft-n-max 1");
  });
});

describe("stopLlamaServer", () => {
  it("does not kill an adopted server", async () => {
    const signals: string[] = [];
    await stopLlamaServer(
      { pid: null, adopted: true },
      { killImpl: (_p, s) => signals.push(s) },
    );
    expect(signals).toEqual([]);
  });

  it("SIGTERMs then returns when the process exits within the grace window", async () => {
    const signals: NodeJS.Signals[] = [];
    let alive = true;
    await stopLlamaServer(
      { pid: 4242, adopted: false },
      {
        graceMs: 2_000,
        killImpl: (_p, s) => {
          signals.push(s);
          if (s === "SIGTERM") alive = false; // clean exit
        },
        aliveImpl: () => alive,
      },
    );
    expect(signals).toEqual(["SIGTERM"]);
  });

  it("escalates to SIGKILL when the process ignores SIGTERM", async () => {
    const signals: NodeJS.Signals[] = [];
    await stopLlamaServer(
      { pid: 4242, adopted: false },
      {
        graceMs: 20,
        killImpl: (_p, s) => signals.push(s),
        aliveImpl: () => true, // never dies
      },
    );
    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
  });
});

describe("withLlamaServer", () => {
  it("runs fn between boot and teardown, and tears down even on throw", async () => {
    const events: string[] = [];
    const spawnImpl: SpawnLike = () => {
      events.push("spawn");
      return { pid: 7, unref: () => {} };
    };
    const { fetchImpl } = healthAfter(2);
    const killImpl = (_p: number, s: NodeJS.Signals) => events.push(`kill:${s}`);

    await expect(
      withLlamaServer(
        async () => {
          events.push("run");
          throw new Error("boom");
        },
        {
          spawnImpl,
          fetchImpl,
          killImpl,
          aliveImpl: () => false, // exits on SIGTERM
          healthUrl: "http://x/health",
          bootTimeoutMs: 5_000,
        },
      ),
    ).rejects.toThrow("boom");

    expect(events).toEqual(["spawn", "run", "kill:SIGTERM"]);
  });
});
