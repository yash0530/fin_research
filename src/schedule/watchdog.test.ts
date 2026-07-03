import { describe, it, expect } from "vitest";
import { shouldKickstart } from "./watchdog";

describe("llama watchdog decision", () => {
  it("never restarts a healthy server", () => {
    expect(shouldKickstart({ healthOk: true, lastKickMs: 0, nowMs: 1_000_000 })).toBe(false);
  });

  it("restarts a down server when no restart was ever issued", () => {
    expect(shouldKickstart({ healthOk: false, lastKickMs: 0, nowMs: 1_000_000 })).toBe(true);
  });

  it("holds off during the cooloff window after a restart", () => {
    expect(
      shouldKickstart({ healthOk: false, lastKickMs: 1_000_000, nowMs: 1_000_000 + 60_000 }),
    ).toBe(false);
  });

  it("tries again once the cooloff has elapsed", () => {
    expect(
      shouldKickstart({ healthOk: false, lastKickMs: 1_000_000, nowMs: 1_000_000 + 300_000 }),
    ).toBe(true);
  });
});
