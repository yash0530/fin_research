// Technical indicators over a close series. Callers pass DESPIKED closes
// (src/lib/metrics.despike). Pure; null on insufficient data.

export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  if (values.length === 0) return out;
  let e = values[0];
  out.push(e);
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

export function ema(values: number[], period: number): number | null {
  if (period <= 0 || values.length === 0) return null;
  const series = emaSeries(values, period);
  return series[series.length - 1];
}

/** Wilder RSI. All-gains → 100, all-losses → 0. Null if fewer than period+1 points. */
export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export type Macd = { macd: number; signal: number; histogram: number };

export function macd(values: number[], fast = 12, slow = 26, signal = 9): Macd | null {
  if (values.length < slow) return null;
  const ef = emaSeries(values, fast);
  const es = emaSeries(values, slow);
  const macdLine = values.map((_, i) => ef[i] - es[i]);
  const sig = emaSeries(macdLine, signal);
  const last = values.length - 1;
  return { macd: macdLine[last], signal: sig[last], histogram: macdLine[last] - sig[last] };
}

export type MaCrossState = "bull" | "bear" | "none";

/** Golden-cross regime: short SMA above long SMA = "bull". */
export function maCrossState(values: number[], short = 50, long = 200): MaCrossState {
  const s = sma(values, short);
  const l = sma(values, long);
  if (s === null || l === null) return "none";
  if (s > l) return "bull";
  if (s < l) return "bear";
  return "none";
}

export type FiftyTwoWeek = {
  high: number;
  low: number;
  pctFromHigh: number;
  pctFromLow: number;
  newHigh: boolean;
};

export function fiftyTwoWeek(values: number[], lookback = 252): FiftyTwoWeek | null {
  if (values.length === 0) return null;
  const slice = values.slice(Math.max(0, values.length - lookback));
  const high = Math.max(...slice);
  const low = Math.min(...slice);
  const last = values[values.length - 1];
  return {
    high,
    low,
    pctFromHigh: high > 0 ? ((last - high) / high) * 100 : 0,
    pctFromLow: low > 0 ? ((last - low) / low) * 100 : 0,
    newHigh: last >= high,
  };
}
