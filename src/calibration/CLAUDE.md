# src/calibration/ — sizing governor + outcomes

Verbatim port of `calibration_service.py`. The governor is the SOLE size guardrail
for a local model: a conviction tier earns its raw size only after a real, favorable
resolved track record.

## Files

- `governor.ts` — constants `CAP=2.0`, `MIN_RESOLVED=5`, `FAVORABLE_THRESHOLD=0.5`.
  - `isFavorable(rec)` — per-action (BUY>0 · TRIM/AVOID/SELL<0 · HOLD |x|≤2.5), using
    the 3m outcome else 1m.
  - `governSize(conviction, judgeSize, recs)` — pass-through ≤cap; else cap until the
    tier has ≥5 resolved AND ≥50% favorable, then trust the judge's size.
  - `tierStats(recs)` — per-tier resolved count / favorable rate / cap-lifted, for /calibration.
- `outcomes.ts` — `addMonthsISO` (day-clamped), `nearestCloseOnOrAfter`, and
  `horizonReturns(created, price, bars, asOf)` filling 1m/3m/6m/1y from LOCAL closes
  (zero network). Not-yet-due horizons stay null.

## Tests

`governor.test.ts` (per-action favorable, unproven cap, proven lift, unfavorable cap,
tierStats) · `outcomes.test.ts` (leap-Feb clamp, year rollover, due vs not-due).
