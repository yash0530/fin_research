import { describe, it, expect } from "vitest";
import { detectedWake, hasTodaysDigest, shouldCatchUp } from "./wake";

describe("scheduler decisions", () => {
  it("detects a wake from a long inter-tick gap", () => {
    expect(detectedWake(0, 200_000)).toBe(true); // 200s > 180s
    expect(detectedWake(0, 100_000)).toBe(false);
  });

  it("same-market-date guard", () => {
    expect(hasTodaysDigest("2026-07-02", "2026-07-02")).toBe(true);
    expect(hasTodaysDigest("2026-07-01", "2026-07-02")).toBe(false);
    expect(hasTodaysDigest(null, "2026-07-02")).toBe(false);
  });

  it("catches up only when there is no digest yet and time is in the morning window", () => {
    const today = "2026-07-02";
    expect(shouldCatchUp({ hour: 8, lastDigestMarketDate: null, todayMarketDate: today })).toBe(true);
    expect(shouldCatchUp({ hour: 3, lastDigestMarketDate: null, todayMarketDate: today })).toBe(false); // too early
    expect(shouldCatchUp({ hour: 20, lastDigestMarketDate: null, todayMarketDate: today })).toBe(false); // too late
    expect(shouldCatchUp({ hour: 8, lastDigestMarketDate: today, todayMarketDate: today })).toBe(false); // already have it
  });
});
