import { isFavorable, tierStats, type CalRec, type TierStat } from "./governor";

export type Horizon = "1m" | "3m" | "6m" | "1y";

export interface BrierResult {
  brier: number | null;
  count: number;
  meanForecast: number | null;
  meanOutcome: number | null;
}

export interface AvoidLedgerEntry {
  symbol: string;
  createdAt: string;
  outcomePct: number;
  correct: boolean;
}

export interface AvoidLedgerResult {
  total: number;
  goodAvoids: number;
  badAvoids: number;
  hitRate: number;
  entries: AvoidLedgerEntry[];
}

export interface StreaksResult {
  current: {
    kind: "correct" | "incorrect";
    length: number;
  };
  longestCorrect: number;
  longestIncorrect: number;
}

export interface Scorecard {
  resolvedCount: number;
  insufficient: boolean;
  brier: BrierResult;
  avoidLedger: AvoidLedgerResult;
  streaks: StreaksResult;
  tierStats: TierStat[];
}

/**
 * Maps (action, conviction) to an implied favorable probability.
 * BUY: HIGH=0.80, MEDIUM=0.65, LOW=0.55
 * HOLD: 0.50
 * TRIM/AVOID/SELL: Symmetric downside (HIGH=0.80, MEDIUM=0.65, LOW=0.55)
 */
export function getImpliedProbability(action: string, conviction: string): number {
  const act = (action || "").toUpperCase();
  const conv = (conviction || "").toUpperCase();

  if (act === "BUY" || act === "TRIM" || act === "AVOID" || act === "SELL") {
    if (conv === "HIGH") return 0.80;
    if (conv === "MEDIUM" || conv === "MED") return 0.65;
    return 0.55; // LOW or fallback
  }
  return 0.50; // HOLD or fallback
}

/** Get the outcome percentage for a specific horizon. */
export function getOutcomeAtHorizon(rec: CalRec, horizon: Horizon): number | null {
  if (horizon === "1m") return rec.outcome1mPct ?? null;
  if (horizon === "3m") return rec.outcome3mPct ?? null;
  if (horizon === "6m") return (rec as any).outcome6mPct ?? null;
  if (horizon === "1y") return (rec as any).outcome1yPct ?? null;
  return null;
}

/** Computes if a recommendation is favorable at the chosen horizon. */
export function isFavorableAtHorizon(rec: CalRec, horizon: Horizon): boolean | null {
  const val = getOutcomeAtHorizon(rec, horizon);
  if (val === null) return null;

  const tempRec: CalRec = {
    ...rec,
    outcome3mPct: val,
    outcome1mPct: null,
  };
  return isFavorable(tempRec);
}

/**
 * Brier score — brierScore(recs, horizon):
 * Brier = mean((p - outcome)²) over resolved recs.
 * Also returns count, meanForecast, meanOutcome.
 */
export function brierScore(recs: CalRec[], horizon: Horizon = "3m"): BrierResult {
  let sumSquaredError = 0;
  let sumForecast = 0;
  let sumOutcome = 0;
  let count = 0;

  for (const rec of recs) {
    const outcomeVal = isFavorableAtHorizon(rec, horizon);
    if (outcomeVal === null) continue;

    const p = getImpliedProbability(rec.action, rec.conviction || "");
    const outcome = outcomeVal ? 1 : 0;

    sumSquaredError += Math.pow(p - outcome, 2);
    sumForecast += p;
    sumOutcome += outcome;
    count++;
  }

  if (count === 0) {
    return { brier: null, count: 0, meanForecast: null, meanOutcome: null };
  }

  return {
    brier: sumSquaredError / count,
    count,
    meanForecast: sumForecast / count,
    meanOutcome: sumOutcome / count,
  };
}

/**
 * Avoid-ledger — avoidLedger(recs):
 * Over AVOID and SELL calls that have resolved.
 * A good avoid is when the name fell or underperformed (outcome negative, i.e. < 0).
 */
export function avoidLedger(recs: CalRec[]): AvoidLedgerResult {
  const entries: AvoidLedgerEntry[] = [];
  let goodAvoids = 0;
  let badAvoids = 0;

  for (const rec of recs) {
    const act = (rec.action || "").toUpperCase();
    if (act !== "AVOID" && act !== "SELL") continue;

    // Use 3m outcome, else 1m (same resolution criteria as isFavorable)
    const outcomeVal = rec.outcome3mPct ?? rec.outcome1mPct ?? null;
    if (outcomeVal === null) continue;

    const correct = outcomeVal < 0;
    if (correct) {
      goodAvoids++;
    } else {
      badAvoids++;
    }

    let createdAtStr = "";
    if (rec.createdAt) {
      createdAtStr = typeof rec.createdAt === "string"
        ? rec.createdAt
        : rec.createdAt instanceof Date
        ? rec.createdAt.toISOString()
        : "";
    }

    entries.push({
      symbol: rec.symbol || "UNKNOWN",
      createdAt: createdAtStr,
      outcomePct: outcomeVal,
      correct,
    });
  }

  const total = goodAvoids + badAvoids;
  const hitRate = total > 0 ? goodAvoids / total : 0;

  return {
    total,
    goodAvoids,
    badAvoids,
    hitRate,
    entries,
  };
}

/**
 * Decision-streaks — decisionStreaks(recs):
 * Orders resolved recs by createdAt.
 * Correct call = isFavorable true (BUY/HOLD/etc.) or true for AVOID (outcome < 0).
 */
export function decisionStreaks(recs: CalRec[]): StreaksResult {
  const resolved = recs.filter((r) => isFavorable(r) !== null);

  if (resolved.length === 0) {
    return {
      current: { kind: "correct", length: 0 },
      longestCorrect: 0,
      longestIncorrect: 0,
    };
  }

  // Sort resolved recs by createdAt ascending
  const sorted = [...resolved].sort((a, b) => {
    const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tA - tB;
  });

  let longestCorrect = 0;
  let longestIncorrect = 0;

  let currentKind: "correct" | "incorrect" = isFavorable(sorted[0]) === true ? "correct" : "incorrect";
  let currentLength = 1;

  if (currentKind === "correct") {
    longestCorrect = 1;
  } else {
    longestIncorrect = 1;
  }

  for (let i = 1; i < sorted.length; i++) {
    const rec = sorted[i];
    const isCorrect = isFavorable(rec) === true;
    const kind: "correct" | "incorrect" = isCorrect ? "correct" : "incorrect";

    if (kind === currentKind) {
      currentLength++;
    } else {
      currentKind = kind;
      currentLength = 1;
    }

    if (currentKind === "correct") {
      longestCorrect = Math.max(longestCorrect, currentLength);
    } else {
      longestIncorrect = Math.max(longestIncorrect, currentLength);
    }
  }

  return {
    current: { kind: currentKind, length: currentLength },
    longestCorrect,
    longestIncorrect,
  };
}

/** Builds the full calibration scorecard. */
export function buildScorecard(recs: CalRec[], horizon: Horizon = "3m"): Scorecard {
  const resolvedCount = recs.filter((r) => isFavorable(r) !== null).length;
  const insufficient = resolvedCount < 5;

  return {
    resolvedCount,
    insufficient,
    brier: brierScore(recs, horizon),
    avoidLedger: avoidLedger(recs),
    streaks: decisionStreaks(recs),
    tierStats: tierStats(recs),
  };
}
