// Monthly buy-list allocation. Candidates = BUY verdicts within the age window,
// ranked by conviction then confidence, sized by min(judge, governed) size,
// allocated over the month's capital with a minimum lot; the residual is cash.
// No broker/execution — this is a plan the user logs actual buys against.

export type Conviction = "HIGH" | "MEDIUM" | "LOW";

export type Candidate = {
  symbol: string;
  dossierId: string;
  action: "BUY" | "HOLD" | "TRIM" | "AVOID";
  conviction: Conviction;
  confidence?: number; // 0..1, tiebreaker
  judgeSizePct: number;
  governedSizePct: number;
  governorReason: string;
  ageDays: number;
};

export type BuyListItem = {
  rank: number;
  symbol: string;
  dossierId: string;
  conviction: Conviction;
  effectiveSizePct: number;
  plannedUsd: number;
  governorReason: string;
  skipped: boolean; // true when below the minimum lot
};

export type BuyList = {
  capitalUsd: number;
  items: BuyListItem[];
  deployedUsd: number;
  cashUsd: number;
};

export type BuildOpts = { capitalUsd: number; minLotUsd: number; maxAgeDays: number };

const CONVICTION_RANK: Record<Conviction, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function buildBuyList(candidates: Candidate[], opts: BuildOpts): BuyList {
  const eligible = candidates
    .filter((c) => c.action === "BUY" && c.ageDays <= opts.maxAgeDays)
    .map((c) => ({ ...c, effectiveSizePct: Math.max(0, Math.min(c.judgeSizePct, c.governedSizePct)) }))
    .sort(
      (a, b) =>
        CONVICTION_RANK[a.conviction] - CONVICTION_RANK[b.conviction] ||
        (b.confidence ?? 0) - (a.confidence ?? 0) ||
        b.effectiveSizePct - a.effectiveSizePct,
    );

  const totalPct = eligible.reduce((s, c) => s + c.effectiveSizePct, 0);
  // If the sizes sum to more than 100% of capital, scale proportionally.
  const scale = totalPct > 100 ? 100 / totalPct : 1;

  const items: BuyListItem[] = eligible.map((c, idx) => {
    const target = opts.capitalUsd * ((c.effectiveSizePct * scale) / 100);
    const plannedUsd = Math.floor(target / opts.minLotUsd) * opts.minLotUsd;
    return {
      rank: idx + 1,
      symbol: c.symbol,
      dossierId: c.dossierId,
      conviction: c.conviction,
      effectiveSizePct: c.effectiveSizePct,
      plannedUsd,
      governorReason: c.governorReason,
      skipped: plannedUsd < opts.minLotUsd,
    };
  });

  const deployedUsd = items.reduce((s, i) => s + i.plannedUsd, 0);
  return {
    capitalUsd: opts.capitalUsd,
    items,
    deployedUsd,
    cashUsd: opts.capitalUsd - deployedUsd,
  };
}
