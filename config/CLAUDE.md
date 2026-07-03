# config/ — repo-root data files

Static, non-code data checked into the repo (as opposed to `src/config/`, which is
typed configuration code).

## Files

- `sp500.csv` — the full-market universe seed: the S&P constituents as
  `ticker,company_name,sector,industry` (503 rows), copied from the read-only donor
  `finance/analysis/sp500_analysis.csv` with only those four columns kept.
  Parsed by `src/lib/universe.ts` (`parseUniverseCsv`) — the `sector` column is mapped
  to a `g_*` GICS code via `GICS_NAME_TO_CODE`, and `scripts/seed.ts` seeds every row
  as a `Ticker` linked to its GICS `Sector`.

## Invariants

- Data only — never imported as a module. The universe is reshaped by editing this CSV
  (S&P membership) and `src/config/sectors.ts` (`AI_INFRA_TICKERS`), then `npm run seed`.
- Quoted fields with embedded commas (e.g. `"Berkshire Hathaway, Inc."`) are preserved;
  the parser is RFC-4180-ish.
