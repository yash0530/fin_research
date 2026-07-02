// Options metrics from a chain. Pure. Port of options_flow.py (yahoo options()):
// put/call ratio, ATM implied vol, and unusual-volume contracts (no paid feed).

export type OptionContract = {
  strike: number;
  openInterest: number;
  impliedVolatility: number;
  volume?: number;
};

export type OptionsChain = {
  underlying: number;
  calls: OptionContract[];
  puts: OptionContract[];
};

export type OptionsMetrics = {
  putCallRatio: number | null; // by open interest
  atmIV: number | null; // IV of the strike nearest the underlying (avg call/put)
  unusual: number; // # contracts with volume > 3× open interest
};

function nearestToStrike(contracts: OptionContract[], underlying: number): OptionContract | null {
  let best: OptionContract | null = null;
  let bestDist = Infinity;
  for (const c of contracts) {
    const d = Math.abs(c.strike - underlying);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export function optionsMetrics(chain: OptionsChain): OptionsMetrics {
  const callOI = chain.calls.reduce((s, c) => s + c.openInterest, 0);
  const putOI = chain.puts.reduce((s, c) => s + c.openInterest, 0);
  const putCallRatio = callOI > 0 ? putOI / callOI : null;

  const atmCall = nearestToStrike(chain.calls, chain.underlying);
  const atmPut = nearestToStrike(chain.puts, chain.underlying);
  const ivs = [atmCall?.impliedVolatility, atmPut?.impliedVolatility].filter(
    (x): x is number => typeof x === "number" && Number.isFinite(x),
  );
  const atmIV = ivs.length > 0 ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;

  const unusual = [...chain.calls, ...chain.puts].filter(
    (c) => (c.volume ?? 0) > 3 * c.openInterest && c.openInterest > 0,
  ).length;

  return { putCallRatio, atmIV, unusual };
}
