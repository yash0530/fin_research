import { drawdownFromCloses } from "../rules/engine";
import type { CloseRow } from "../rules/types";
import type { RecCall } from "../dossier/state";

export type PositionView = {
  symbol: string;
  qty: number;
  avgCost: number;
  currentPrice: number | null;
  marketValue: number | null;
  pnlPct: number | null;
  costBasis: number;
};

export type DecayFinding = {
  symbol: string;
  kind: "stop_breach" | "drawdown" | "below_cost" | "target_reached";
  severity: "info" | "warn" | "critical";
  message: string;
};

export function positionView(
  pos: { symbol: string; qty: number; avgCost: number },
  currentPrice: number | null,
): PositionView {
  const costBasis = pos.qty * pos.avgCost;
  const marketValue = currentPrice !== null ? pos.qty * currentPrice : null;
  const pnlPct =
    currentPrice !== null && pos.avgCost > 0
      ? Math.round(((currentPrice - pos.avgCost) / pos.avgCost) * 100 * 100) / 100
      : null;

  return {
    symbol: pos.symbol,
    qty: pos.qty,
    avgCost: pos.avgCost,
    currentPrice,
    marketValue,
    pnlPct,
    costBasis,
  };
}

export function decaySignals(inputs: {
  symbol: string;
  currentPrice: number | null;
  avgCost: number | null;
  closes: CloseRow[] | null;
  recCall: RecCall | null;
}): DecayFinding[] {
  const findings: DecayFinding[] = [];
  const { symbol, currentPrice, avgCost, closes, recCall } = inputs;

  // 1. stop_breach (critical)
  // when recCall.stopPrice != null AND currentPrice < stopPrice (for a BUY-side call)
  if (
    recCall &&
    recCall.stopPrice !== null &&
    recCall.stopPrice !== undefined &&
    currentPrice !== null &&
    currentPrice !== undefined &&
    recCall.action === "BUY"
  ) {
    if (currentPrice < recCall.stopPrice) {
      findings.push({
        symbol,
        kind: "stop_breach",
        severity: "critical",
        message: `${symbol} stop_breach @ ${currentPrice} (stop: ${recCall.stopPrice})`,
      });
    }
  }

  // 2. drawdown (warn)
  // when drawdownFromCloses(closes, 252) <= -25
  if (closes && closes.length > 0) {
    const dd = drawdownFromCloses(closes, 252);
    if (dd !== null && dd <= -25) {
      findings.push({
        symbol,
        kind: "drawdown",
        severity: "warn",
        message: `${symbol} drawdown ${dd}%`,
      });
    }
  }

  // 3. target_reached (info)
  // when currentPrice >= recCall.targetHigh
  if (
    recCall &&
    recCall.targetHigh !== null &&
    recCall.targetHigh !== undefined &&
    currentPrice !== null &&
    currentPrice !== undefined
  ) {
    if (currentPrice >= recCall.targetHigh) {
      findings.push({
        symbol,
        kind: "target_reached",
        severity: "info",
        message: `${symbol} target_reached @ ${currentPrice} (target: ${recCall.targetHigh})`,
      });
    }
  }

  // 4. below_cost (info)
  // when currentPrice < avgCost
  if (
    currentPrice !== null &&
    currentPrice !== undefined &&
    avgCost !== null &&
    avgCost !== undefined
  ) {
    if (currentPrice < avgCost) {
      findings.push({
        symbol,
        kind: "below_cost",
        severity: "info",
        message: `${symbol} below_cost @ ${currentPrice} (cost: ${avgCost})`,
      });
    }
  }

  return findings;
}
