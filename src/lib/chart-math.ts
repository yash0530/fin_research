// Pure chart and indicator mathematics for the stock view CandleChart.
// Tested co-located with chart-math.test.ts in root test runner.

export function smaSeries(values: number[], period: number): (number | null)[] {
  if (period <= 0 || values.length === 0) {
    return values.map(() => null);
  }
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      out.push(sum / period);
    } else {
      out.push(null);
    }
  }
  return out;
}

export function emaSeries(values: number[], period: number): number[] {
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

export function rsiSeries(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  if (values.length <= period) {
    return values.map(() => null);
  }

  // Pre-fill nulls for indices before 'period'
  for (let i = 0; i < period; i++) {
    out.push(null);
  }

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  if (avgLoss === 0) {
    out.push(100);
  } else if (avgGain === 0) {
    out.push(0);
  } else {
    const rs = avgGain / avgLoss;
    out.push(100 - 100 / (1 + rs));
  }

  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;

    if (avgLoss === 0) {
      out.push(100);
    } else if (avgGain === 0) {
      out.push(0);
    } else {
      const rs = avgGain / avgLoss;
      out.push(100 - 100 / (1 + rs));
    }
  }

  return out;
}

export interface MacdPoint {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

export function macdSeries(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): MacdPoint[] {
  if (values.length === 0) return [];
  const out: MacdPoint[] = [];

  const ef = emaSeries(values, fast);
  const es = emaSeries(values, slow);
  const macdLine = values.map((_, i) => ef[i] - es[i]);
  const sig = emaSeries(macdLine, signal);

  for (let i = 0; i < values.length; i++) {
    if (i < slow - 1) {
      out.push({ macd: null, signal: null, histogram: null });
    } else {
      const m = macdLine[i];
      const s = sig[i];
      const h = m - s;
      out.push({ macd: m, signal: s, histogram: h });
    }
  }
  return out;
}

export interface LayoutScale {
  domainMin: number;
  domainMax: number;
  rangeMin: number;
  rangeMax: number;
}

export function scaleValue(val: number, scale: LayoutScale): number {
  const domainRange = scale.domainMax - scale.domainMin;
  const rangeRange = scale.rangeMax - scale.rangeMin;
  if (domainRange === 0) return scale.rangeMin;
  const pct = (val - scale.domainMin) / domainRange;
  return scale.rangeMin + pct * rangeRange;
}
