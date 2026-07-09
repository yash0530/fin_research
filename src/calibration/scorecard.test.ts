import { describe, it, expect } from "vitest";
import { type CalRec } from "./governor";
import {
  brierScore,
  avoidLedger,
  decisionStreaks,
  buildScorecard,
  getImpliedProbability,
} from "./scorecard";

const makeRec = (
  action: CalRec["action"],
  conviction: string,
  out3m: number | null,
  createdAt: string = "2026-07-01T00:00:00Z",
  symbol: string = "XYZ",
  out1m: number | null = null,
): CalRec => ({
  action,
  conviction,
  outcome1mPct: out1m,
  outcome3mPct: out3m,
  createdAt,
  symbol,
});

describe("Scorecard - Implied Probability", () => {
  it("maps BUY convictions correctly", () => {
    expect(getImpliedProbability("BUY", "HIGH")).toBe(0.80);
    expect(getImpliedProbability("BUY", "MEDIUM")).toBe(0.65);
    expect(getImpliedProbability("BUY", "MED")).toBe(0.65);
    expect(getImpliedProbability("BUY", "LOW")).toBe(0.55);
  });

  it("maps HOLD conviction to 0.50", () => {
    expect(getImpliedProbability("HOLD", "HIGH")).toBe(0.50);
  });

  it("maps AVOID/SELL/TRIM convictions symmetrically", () => {
    expect(getImpliedProbability("AVOID", "HIGH")).toBe(0.80);
    expect(getImpliedProbability("SELL", "MEDIUM")).toBe(0.65);
    expect(getImpliedProbability("TRIM", "LOW")).toBe(0.55);
  });
});

describe("Scorecard - Brier Score", () => {
  it("returns null/0 for empty resolved recs", () => {
    const res = brierScore([]);
    expect(res.brier).toBeNull();
    expect(res.count).toBe(0);
    expect(res.meanForecast).toBeNull();
    expect(res.meanOutcome).toBeNull();
  });

  it("computes perfect calibration correctly (4/5 favorable for 80% forecast)", () => {
    // 5 BUY/HIGH calls (implied p = 0.80). 4 are favorable, 1 is unfavorable.
    const recs = [
      makeRec("BUY", "HIGH", 5), // favorable (outcome > 0)
      makeRec("BUY", "HIGH", 10), // favorable
      makeRec("BUY", "HIGH", 1.5), // favorable
      makeRec("BUY", "HIGH", 8), // favorable
      makeRec("BUY", "HIGH", -2), // unfavorable
    ];
    const res = brierScore(recs, "3m");
    // Expected:
    // 4 favorable: (0.80 - 1.0)^2 = 0.04 each
    // 1 unfavorable: (0.80 - 0.0)^2 = 0.64
    // Mean: (4 * 0.04 + 0.64) / 5 = (0.16 + 0.64) / 5 = 0.16
    expect(res.count).toBe(5);
    expect(res.brier).toBeCloseTo(0.16);
    expect(res.meanForecast).toBeCloseTo(0.80);
    expect(res.meanOutcome).toBeCloseTo(0.80);
  });

  it("computes all-wrong calibration correctly (0/5 favorable for 80% forecast)", () => {
    const recs = [
      makeRec("BUY", "HIGH", -5),
      makeRec("BUY", "HIGH", -10),
      makeRec("BUY", "HIGH", -1.5),
      makeRec("BUY", "HIGH", -8),
      makeRec("BUY", "HIGH", -2),
    ];
    const res = brierScore(recs, "3m");
    // Expected:
    // 5 unfavorable: (0.80 - 0)^2 = 0.64 each
    // Mean: 0.64
    expect(res.count).toBe(5);
    expect(res.brier).toBeCloseTo(0.64);
    expect(res.meanForecast).toBeCloseTo(0.80);
    expect(res.meanOutcome).toBeCloseTo(0.00);
  });

  it("handles different horizons and skips unresolved calls", () => {
    const recs = [
      makeRec("BUY", "HIGH", 5, "2026-07-01T00:00:00Z", "AAPL", 10), // 3m outcome is 5, 1m outcome is 10
      makeRec("BUY", "HIGH", null, "2026-07-01T00:00:00Z", "MSFT", 8), // 3m unresolved, 1m resolved
      makeRec("BUY", "HIGH", null, "2026-07-01T00:00:00Z", "TSLA", null), // both unresolved
    ];

    const res3m = brierScore(recs, "3m");
    expect(res3m.count).toBe(1); // Only AAPL resolved at 3m

    const res1m = brierScore(recs, "1m");
    expect(res1m.count).toBe(2); // AAPL and MSFT resolved at 1m
  });
});

describe("Scorecard - Avoid Ledger", () => {
  it("classifies good/bad avoids and sells", () => {
    const recs = [
      makeRec("AVOID", "HIGH", -5, "2026-07-01", "AAPL"), // fell (good avoid)
      makeRec("AVOID", "HIGH", 2, "2026-07-01", "MSFT"), // rose (bad avoid)
      makeRec("SELL", "MEDIUM", -10, "2026-07-01", "GOOG"), // fell (good avoid)
      makeRec("SELL", "MEDIUM", 0, "2026-07-01", "AMZN"), // flat/positive (bad avoid)
      makeRec("BUY", "HIGH", 10, "2026-07-01", "TSLA"), // ignored (BUY)
      makeRec("AVOID", "HIGH", null, "2026-07-01", "META"), // ignored (unresolved)
    ];

    const ledger = avoidLedger(recs);
    expect(ledger.total).toBe(4);
    expect(ledger.goodAvoids).toBe(2);
    expect(ledger.badAvoids).toBe(2);
    expect(ledger.hitRate).toBe(0.5);
    expect(ledger.entries).toHaveLength(4);
    expect(ledger.entries).toContainEqual({
      symbol: "AAPL",
      createdAt: "2026-07-01",
      outcomePct: -5,
      correct: true,
    });
  });
});

describe("Scorecard - Decision Streaks", () => {
  it("counts streaks correctly, including current-run edge", () => {
    const recs = [
      makeRec("BUY", "HIGH", 5, "2026-07-01T00:00:00Z"), // correct (1)
      makeRec("BUY", "HIGH", 10, "2026-07-02T00:00:00Z"), // correct (2)
      makeRec("BUY", "HIGH", -2, "2026-07-03T00:00:00Z"), // incorrect (1)
      makeRec("BUY", "HIGH", 3, "2026-07-04T00:00:00Z"), // correct (1)
      makeRec("BUY", "HIGH", 1, "2026-07-05T00:00:00Z"), // correct (2)
      makeRec("BUY", "HIGH", 4, "2026-07-06T00:00:00Z"), // correct (3) -- current run
    ];

    const res = decisionStreaks(recs);
    expect(res.longestCorrect).toBe(3);
    expect(res.longestIncorrect).toBe(1);
    expect(res.current).toEqual({ kind: "correct", length: 3 });
  });

  it("handles a streak ending in incorrect current run", () => {
    const recs = [
      makeRec("BUY", "HIGH", 5, "2026-07-01T00:00:00Z"), // correct
      makeRec("BUY", "HIGH", 10, "2026-07-02T00:00:00Z"), // correct
      makeRec("BUY", "HIGH", -2, "2026-07-03T00:00:00Z"), // incorrect
      makeRec("BUY", "HIGH", -5, "2026-07-04T00:00:00Z"), // incorrect -- current run
    ];

    const res = decisionStreaks(recs);
    expect(res.longestCorrect).toBe(2);
    expect(res.longestIncorrect).toBe(2);
    expect(res.current).toEqual({ kind: "incorrect", length: 2 });
  });
});

describe("Scorecard - Build Scorecard", () => {
  it("flags insufficient when < 5 resolved calls", () => {
    const recs = [
      makeRec("BUY", "HIGH", 5),
      makeRec("BUY", "HIGH", -2),
    ];
    const sc = buildScorecard(recs);
    expect(sc.resolvedCount).toBe(2);
    expect(sc.insufficient).toBe(true);
  });

  it("flags sufficient when >= 5 resolved calls", () => {
    const recs = [
      makeRec("BUY", "HIGH", 5),
      makeRec("BUY", "HIGH", -2),
      makeRec("BUY", "HIGH", 3),
      makeRec("BUY", "HIGH", 1),
      makeRec("BUY", "HIGH", -1),
    ];
    const sc = buildScorecard(recs);
    expect(sc.resolvedCount).toBe(5);
    expect(sc.insufficient).toBe(false);
  });
});
