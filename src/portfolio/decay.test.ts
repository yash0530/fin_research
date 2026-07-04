import { describe, it, expect } from "vitest";
import { positionView, decaySignals } from "./decay";
import type { RecCall } from "../dossier/state";

const mockRecCall = (overrides: Partial<RecCall> = {}): RecCall => ({
  dossierId: "test-dossier",
  symbol: "XYZ",
  action: "BUY",
  conviction: "HIGH",
  priceAtCall: 100,
  targetLow: 120,
  targetHigh: 150,
  stopPrice: 80,
  judgeSizePct: 5,
  governedSizePct: 5,
  governorReason: "",
  model: "test-model",
  thinkingMode: false,
  promptVersion: "v1",
  createdAt: Date.now(),
  outcome1mPct: null,
  outcome3mPct: null,
  outcome6mPct: null,
  outcome1yPct: null,
  thesisFalsified: null,
  ...overrides,
});

describe("decaySignals & positionView (pure)", () => {
  describe("positionView", () => {
    it("handles null currentPrice", () => {
      const pos = { symbol: "AAPL", qty: 10, avgCost: 150 };
      const view = positionView(pos, null);
      expect(view).toEqual({
        symbol: "AAPL",
        qty: 10,
        avgCost: 150,
        currentPrice: null,
        marketValue: null,
        pnlPct: null,
        costBasis: 1500,
      });
    });

    it("calculates correct P&L and market value when currentPrice is present", () => {
      const pos = { symbol: "AAPL", qty: 10, avgCost: 150 };
      const view = positionView(pos, 165);
      expect(view).toEqual({
        symbol: "AAPL",
        qty: 10,
        avgCost: 150,
        currentPrice: 165,
        marketValue: 1650,
        pnlPct: 10, // ((165 - 150) / 150) * 100
        costBasis: 1500,
      });
    });
  });

  describe("decaySignals", () => {
    it("returns empty when all inputs are null", () => {
      const findings = decaySignals({
        symbol: "XYZ",
        currentPrice: null,
        avgCost: null,
        closes: null,
        recCall: null,
      });
      expect(findings).toEqual([]);
    });

    it("detects stop_breach (critical) for a BUY-side call", () => {
      const recCall = mockRecCall({ stopPrice: 80, action: "BUY" });
      const findings = decaySignals({
        symbol: "XYZ",
        currentPrice: 79,
        avgCost: 100,
        closes: null,
        recCall,
      });
      expect(findings).toContainEqual({
        symbol: "XYZ",
        kind: "stop_breach",
        severity: "critical",
        message: "XYZ stop_breach @ 79 (stop: 80)",
      });
    });

    it("does not detect stop_breach if action is not BUY", () => {
      const recCall = mockRecCall({ stopPrice: 80, action: "HOLD" as any });
      const findings = decaySignals({
        symbol: "XYZ",
        currentPrice: 79,
        avgCost: 100,
        closes: null,
        recCall,
      });
      expect(findings.filter((f) => f.kind === "stop_breach")).toEqual([]);
    });

    it("detects drawdown (warn)", () => {
      // Create closes with a 30% drawdown
      const closes = [
        { d: "2026-01-01", close: 100 },
        { d: "2026-01-02", close: 70 },
      ];
      const findings = decaySignals({
        symbol: "XYZ",
        currentPrice: 70,
        avgCost: 100,
        closes,
        recCall: null,
      });
      expect(findings).toContainEqual({
        symbol: "XYZ",
        kind: "drawdown",
        severity: "warn",
        message: "XYZ drawdown -30%",
      });
    });

    it("detects target_reached (info)", () => {
      const recCall = mockRecCall({ targetHigh: 150 });
      const findings = decaySignals({
        symbol: "XYZ",
        currentPrice: 155,
        avgCost: 100,
        closes: null,
        recCall,
      });
      expect(findings).toContainEqual({
        symbol: "XYZ",
        kind: "target_reached",
        severity: "info",
        message: "XYZ target_reached @ 155 (target: 150)",
      });
    });

    it("detects below_cost (info)", () => {
      const findings = decaySignals({
        symbol: "XYZ",
        currentPrice: 90,
        avgCost: 100,
        closes: null,
        recCall: null,
      });
      expect(findings).toContainEqual({
        symbol: "XYZ",
        kind: "below_cost",
        severity: "info",
        message: "XYZ below_cost @ 90 (cost: 100)",
      });
    });
  });
});
