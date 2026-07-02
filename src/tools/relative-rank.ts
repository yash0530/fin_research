// Relative ranking across the local universe. Port of sp500_lookup.py →
// relative-rank semantics: percentile position + spotlight tags. Pure.

/** Percent of the universe at or below `value` (0–100). */
export function percentileRank(universe: number[], value: number): number {
  if (universe.length === 0) return 0;
  const atOrBelow = universe.filter((v) => v <= value).length;
  return (atOrBelow / universe.length) * 100;
}

export type RankEntry = { symbol: string; metric: number };
export type RankedEntry = {
  symbol: string;
  metric: number;
  percentile: number;
  tag: "leader" | "laggard" | null;
};

/**
 * Rank entries by `metric`. Top `leaderPct` percentile → "leader", bottom
 * `laggardPct` → "laggard". Returned sorted by percentile descending.
 */
export function rankUniverse(
  entries: RankEntry[],
  opts: { leaderPct?: number; laggardPct?: number } = {},
): RankedEntry[] {
  const leaderPct = opts.leaderPct ?? 90;
  const laggardPct = opts.laggardPct ?? 10;
  const metrics = entries.map((e) => e.metric);
  return entries
    .map((e): RankedEntry => {
      const percentile = percentileRank(metrics, e.metric);
      const tag = percentile >= leaderPct ? "leader" : percentile <= laggardPct ? "laggard" : null;
      return { symbol: e.symbol, metric: e.metric, percentile, tag };
    })
    .sort((a, b) => b.percentile - a.percentile);
}
