# M3-C: canonical earnings-quality forensics (before/after)

The "measured iteration" of month 3. Started from a transcript review that found the QoE
tool degrading to an FCF proxy on every dossier; ended with canonical forensics that
track reality — after uncovering (and fixing) three stacked data-quality bugs.

## Before → After (the QoE tool on MU/NVDA/AAPL)

| | Before (month 2) | After (M3-C) |
|---|---|---|
| data_status | `missing` / `partial` (proxy) | **`ok`** |
| confidence | `low` | **`high`** |
| Altman Z | not computed | **MU 5.35 safe · NVDA 6.37 safe · AAPL 2.85 grey** |
| accrual ratio | FCF proxy (or wrong 0.56) | canonical, sanity-guarded (AAPL −0.0008) |
| note | "inputs absent from local schema" | `computed[]` / `omitted[]` transparency |

**The validation that it's real, not just non-null:** AAPL correctly lands in the grey
zone (buybacks erode book equity + real debt) while MU/NVDA are safe — a naive impl
would have mislabeled AAPL. AAPL's ~0 accrual (CFO ≈ net income) is exactly right.

## What it took (4 sub-batches, each fixing a distinct real defect)
- **C.1** deepen FundamentalsQuarter with 8 canonical inputs (cfo/sga/depreciation +
  balance-sheet instants), all from EDGAR companyfacts we already fetch.
- **C.2** wire the QoE tool to the golden-tested `qoeReport()` (reuse, not reinvent).
- **C.3** correctness: normalize capex sign (was flipping ±, corrupting CFO recon),
  sanity-guard `|accrual|>1`, honest partial — never a wrong number.
- **C.4** MERGE (not select) complementary Yahoo/EDGAR duplicate quarters — the fix that
  made Altman compute on real large-caps (one row had the cash-flow fields, its sibling
  the balance-sheet instants; selecting one dropped half the data).

## Honest limitations (documented, not hidden)
- **Accrual ratio can be inflated** where quarterly CFO is sparse (cash-flow statements
  report YTD-cumulatively in interims, so clean single-quarter CFO exists mainly in
  fiscal-Q1). TTM CFO can undercount → accrual overstated (MU 0.29 is high-but-directional
  for a cyclical ramp). It's sanity-guarded and flagged, never presented as precise.
- **Beneish M / Piotroski F are honestly omitted** for most names — they need two fully-
  clean consecutive TTM periods, which the sparse interim data rarely provides.
- **The clean architectural fix** (not done — scoped out) is to compute forensics from
  ANNUAL 10-K periods (which carry all fields cleanly) rather than aggregating sparse
  quarters. That's the documented next step if forensic depth becomes a priority.

## Permanent win beyond QoE
The 20-year deep fundamentals (35k rows, now with cfo/sga/receivables/etc.) feed DCF,
financial-trends, and story-page charts — not just QoE. That data is banked regardless.

## Process note
Every one of the 4 batches passed `npm run verify` green while doing the wrong thing on
real data (proxy → wrong 0.56 → `missing` → correct). What advanced it each time was
reading the actual Micron/Apple numbers and rejecting output that didn't make sense —
not more code. Tests prove structure; only judgment proves truth.
