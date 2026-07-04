# agy batch M3-B.1 — Backtest engine core (pure + tests ONLY, no job)

Narrow slice: the correctness-critical, LEAK-FREE core. No job, no live run this batch.
Just pure functions + as-of DB read helpers + thorough tests. Small and sequential.

## The rule that must be perfect: NO LOOKAHEAD
Every price read must be windowed to `d <= asOf`. A backtest that reads even one bar
after asOf is worthless. Prove it with a dedicated test.

## Read first (for exact patterns — do not edit these)
- `src/db/queries.ts` — `closesSince(db, sinceD)` (note: `d >= sinceD`, NO upper bound),
  `activeSymbols`, the Price row shape, the `despike` import. Match this file's style.
- `src/lib/metrics.ts` — `despike`.
- `src/jobs/outcomes.test.ts` OR `src/jobs/universe.test.ts` — copy the test harness
  pattern EXACTLY: `createRequire("node:sqlite")`, applyMigrations over all
  prisma/migrations, `:memory:` DB, `insertPrices`.

## Deliverables (create these files, nothing else)
1. `src/db/queries.ts` — ADD two functions (additive, near `closesSince`):
   - `closesBetween(db, sinceD, asOf)`: `SELECT symbol,d,close FROM Price WHERE d>=? AND d<=? ORDER BY symbol,d`.
   - `symbolClosesUpTo(db, symbol, asOf)`: `SELECT d,close FROM Price WHERE symbol=? AND d<=? ORDER BY d ASC` → `{d,close}[]`.
   Do NOT change any existing function.
2. `src/backtest/engine.ts` — pure (plain inputs → outputs, NO db inside):
   - `type Bar = { d: string; close: number }`.
   - `forwardReturnPct(bars: Bar[], fromD: string, horizonDays: number): number | null`
     — despike the closes; find the close on/nearest-before `fromD` (start) and the close
     nearest-on-or-after `fromD`+horizonDays (end); return `(end-start)/start*100`, or
     null if either is missing. NEVER read a bar the caller didn't pass.
   - `monthEndGrid(startISO: string, endISO: string): string[]` — calendar month-end
     dates (YYYY-MM-DD) from start to end inclusive. The return fn snaps to nearest bar,
     so exact trading-day precision isn't required.
   - `scoreSignal(flaggedReturns: number[], baselineMean: number): { n; flaggedMean; baselineMean; excess; hitRate }`
     — flaggedMean = mean(flaggedReturns); excess = flaggedMean − baselineMean;
     hitRate = fraction of flaggedReturns > baselineMean; n = flaggedReturns.length.
     Empty → n:0, means 0, hitRate 0.
   - `mean(xs: number[]): number` helper (0 on empty).
3. `src/backtest/engine.test.ts` — fixtures:
   - forwardReturnPct: a known ascending series → correct %, snapping to nearest bar;
     insufficient forward data → null.
   - monthEndGrid: a 3-month span → the 3 month-end dates.
   - scoreSignal: flagged beats baseline (positive excess, hitRate>0.5); flagged loses
     (negative excess); empty → zeros.
4. `src/db/queries.test.ts` — ADD (do not remove existing) a LOOKAHEAD test: seed Price
   with bars at 2020-01-31, 2020-02-28, and 2020-03-31; assert `closesBetween(db,
   '2020-01-01','2020-02-28')` returns ONLY the Jan+Feb bars (NOT March), and
   `symbolClosesUpTo(db,'X','2020-02-28')` excludes the March bar. This is the leak guard.
5. `src/backtest/CLAUDE.md` — one paragraph: this dir is the pure, leak-free backtest
   core; the as-of families + job come in M3-B.2; the invariant is every read is
   `d <= asOf`.

## Hard constraints
Touch ONLY: src/db/queries.ts, src/db/queries.test.ts, src/backtest/engine.ts,
src/backtest/engine.test.ts, src/backtest/CLAUDE.md, and this spec's ## Result.
Nothing else. No `any`. Additive to queries.ts (no edits to existing fns). SEQUENTIAL
writes, NO subagents. Do NOT commit.

## Gate
`npm run verify` exit 0 (tsc + vitest + CLAUDE.md coverage).

## Wrap-up
Append `## Result`: files created, test count delta, confirmation the lookahead test passes.
