# src/lib/ — pure primitives

Small, dependency-free numeric helpers used at every price read path.

## Files

- `metrics.ts`
  - `despike(values, {window=10, factor=2.5})` — rolling-median bad-tick filter. A close
    ≥ `factor`× (or ≤ 1/`factor`×) its local-window median is replaced by that median.
    The wide window keeps a **multi-day spike block** a minority so it can't pull the
    median with it. Returns a cleaned copy — never mutates the input.
  - `median(values)` · `pctChange(from, to)` (null on divide-by-zero) · `maxDrawdownPct(closes)`.
- `universe.ts` — `parseUniverseCsv(csv)`: S&P rows (ticker/company/sector/industry) →
  `UniverseRow` with the GICS name mapped to its `g_*` code (unmapped → null). Quoted-field
  aware. `countByGics(rows)` tallies constituents per code.

## Why it matters

ENGINE once surfaced a fake "-88% drawdown" from a 10× bad tick. Despiking at the read
path (not mutating stored prices) means every downstream metric — board, sparklines,
synthesis, dossier evidence — sees clean data while the raw store stays untouched.

## Tests

`metrics.test.ts` (7): single spike removal, multi-day block survival, trend preservation
(no false positives), input immutability, pctChange guard, drawdown from running peak.
