// Sizing governor — the house rule "conservative sizing until calibration is
// earned", in code. Verbatim port of calibration_service.py constants + logic.
// The Judge's raw size is trusted only after a conviction tier has a real,
// favorable resolved track record. This is the sole guardrail for a local model.

export const GOVERNOR_CONSERVATIVE_CAP_PCT = 2.0;
export const GOVERNOR_MIN_RESOLVED = 5;
export const GOVERNOR_FAVORABLE_THRESHOLD = 0.5;

export type Action = "BUY" | "HOLD" | "TRIM" | "AVOID" | "SELL";
export type Conviction = "HIGH" | "MEDIUM" | "LOW";

export type CalRec = {
  action: Action;
  conviction: Conviction | string;
  outcome1mPct: number | null;
  outcome3mPct: number | null;
};

/**
 * Favorable-per-action semantics (uses 3m outcome, else 1m):
 *   BUY favorable if return > 0; TRIM/AVOID/SELL if < 0; HOLD if |return| <= 2.5.
 * Returns null when the call is not yet resolved.
 */
export function isFavorable(rec: CalRec): boolean | null {
  const outcome = rec.outcome3mPct ?? rec.outcome1mPct;
  if (outcome === null || outcome === undefined) return null;
  const a = rec.action;
  if (a === "BUY") return outcome > 0;
  if (a === "TRIM" || a === "AVOID" || a === "SELL") return outcome < 0;
  if (a === "HOLD") return Math.abs(outcome) <= 2.5;
  return null;
}

export type GovernResult = { governed: number; reason: string };

/**
 * Cap the Judge's position size by the earned track record at this conviction.
 * Sizes already at/under the cap pass through unchanged.
 */
export function governSize(
  conviction: string,
  judgeSizePct: number | null,
  recs: CalRec[] = [],
): GovernResult {
  if (judgeSizePct === null || judgeSizePct === undefined) return { governed: 0, reason: "" };
  if (judgeSizePct <= GOVERNOR_CONSERVATIVE_CAP_PCT) return { governed: judgeSizePct, reason: "" };

  const tier = (conviction || "LOW").toUpperCase();
  const resolved = recs.filter(
    (r) => (r.conviction || "").toUpperCase() === tier && isFavorable(r) !== null,
  );
  const n = resolved.length;
  const cap = GOVERNOR_CONSERVATIVE_CAP_PCT;

  if (n < GOVERNOR_MIN_RESOLVED) {
    return {
      governed: cap,
      reason: `Only ${n} resolved ${tier} call(s); capped to ${cap.toFixed(0)}% until calibration is earned (${GOVERNOR_MIN_RESOLVED} needed).`,
    };
  }

  const favorableRate = resolved.filter((r) => isFavorable(r) === true).length / n;
  if (favorableRate < GOVERNOR_FAVORABLE_THRESHOLD) {
    return {
      governed: cap,
      reason: `${tier} calls favorable only ${(favorableRate * 100).toFixed(0)}% over ${n} resolved; capped to ${cap.toFixed(0)}% until edge is demonstrated.`,
    };
  }
  // Edge demonstrated — trust the Judge's size.
  return { governed: judgeSizePct, reason: "" };
}

export type TierStat = { tier: string; resolved: number; favorableRate: number | null; capLifted: boolean };

/** /calibration summary: favorable rate + cap status per conviction tier. */
export function tierStats(recs: CalRec[]): TierStat[] {
  const tiers = ["HIGH", "MEDIUM", "LOW"];
  return tiers.map((tier) => {
    const resolved = recs.filter(
      (r) => (r.conviction || "").toUpperCase() === tier && isFavorable(r) !== null,
    );
    const n = resolved.length;
    const rate = n > 0 ? resolved.filter((r) => isFavorable(r) === true).length / n : null;
    const capLifted = n >= GOVERNOR_MIN_RESOLVED && rate !== null && rate >= GOVERNOR_FAVORABLE_THRESHOLD;
    return { tier, resolved: n, favorableRate: rate, capLifted };
  });
}
