// Data-hygiene primitives. `despike` is applied at every price read path so a
// bad tick (split artifact, fat-fingered feed value) can never masquerade as a
// signal. Ported from ResearchEngine/lib/metrics.ts (rolling-median filter that
// survives multi-day spike *blocks* without dropping legitimate trends).
// Non-destructive: returns a cleaned copy, never mutates the input.

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type DespikeOpts = {
  /** Half-window of neighbours on each side used for the local median. */
  window?: number;
  /** A point >= factor*median or <= median/factor is treated as a bad tick. */
  factor?: number;
};

/**
 * Replace outlier ticks with their local rolling median. Window is wide (default
 * 10 each side => 21-point neighbourhood) so a multi-day spike block stays a
 * minority of the window and cannot pull the median with it.
 */
export function despike(values: number[], opts: DespikeOpts = {}): number[] {
  const window = opts.window ?? 10;
  const factor = opts.factor ?? 2.5;
  if (values.length < 3) return values.slice();

  const out = values.slice();
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(values.length, i + window + 1);
    const neighbourhood: number[] = [];
    for (let k = lo; k < hi; k++) {
      if (k !== i) neighbourhood.push(values[k]);
    }
    const med = median(neighbourhood);
    if (med > 0) {
      const v = values[i];
      if (v > med * factor || v < med / factor) {
        out[i] = med;
      }
    }
  }
  return out;
}

/** Percent change between two closes, guarding divide-by-zero. */
export function pctChange(from: number, to: number): number | null {
  if (from === 0 || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

/** Max drawdown (most negative pct from a running peak) over a close series. */
export function maxDrawdownPct(closes: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    if (peak > 0) {
      const dd = ((c - peak) / peak) * 100;
      if (dd < worst) worst = dd;
    }
  }
  return worst;
}
