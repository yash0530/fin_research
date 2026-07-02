// Outcome horizon math for calibration. Fills 1m/3m/6m/1y returns from LOCAL
// closes (zero network) — the weekly outcomes job calls this. Port of
// calibration_service._compute_due_returns / _add_months / _nearest_close.

export type Bar = { d: string; close: number }; // d = YYYY-MM-DD, sorted asc

export const HORIZONS: { label: "1m" | "3m" | "6m" | "1y"; months: number }[] = [
  { label: "1m", months: 1 },
  { label: "3m", months: 3 },
  { label: "6m", months: 6 },
  { label: "1y", months: 12 },
];

/** Add whole months to a YYYY-MM-DD string, clamping the day to the target month. */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const monthIndex = m - 1 + months;
  const ty = y + Math.floor(monthIndex / 12);
  const tm = ((monthIndex % 12) + 12) % 12; // 0-based
  const daysInMonth = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const td = Math.min(d, daysInMonth);
  const mm = String(tm + 1).padStart(2, "0");
  const dd = String(td).padStart(2, "0");
  return `${ty}-${mm}-${dd}`;
}

/** First close on or after the target date (bars sorted ascending by `d`). */
export function nearestCloseOnOrAfter(bars: Bar[], targetIso: string): number | null {
  for (const b of bars) {
    if (b.d >= targetIso) return b.close;
  }
  return null;
}

export type HorizonReturns = {
  outcome1mPct: number | null;
  outcome3mPct: number | null;
  outcome6mPct: number | null;
  outcome1yPct: number | null;
};

/**
 * Compute the return at each horizon whose target date has arrived (<= asOf) and
 * for which a close exists. Horizons not yet due, or with no close, stay null.
 */
export function horizonReturns(
  createdIso: string,
  priceAtCall: number,
  bars: Bar[],
  asOfIso: string,
): HorizonReturns {
  const out: HorizonReturns = {
    outcome1mPct: null,
    outcome3mPct: null,
    outcome6mPct: null,
    outcome1yPct: null,
  };
  if (priceAtCall <= 0) return out;
  const key = {
    "1m": "outcome1mPct",
    "3m": "outcome3mPct",
    "6m": "outcome6mPct",
    "1y": "outcome1yPct",
  } as const;
  for (const h of HORIZONS) {
    const target = addMonthsISO(createdIso, h.months);
    if (target > asOfIso) continue; // not due yet
    const close = nearestCloseOnOrAfter(bars, target);
    if (close === null) continue;
    out[key[h.label]] = Math.round(((close - priceAtCall) / priceAtCall) * 100 * 100) / 100;
  }
  return out;
}
