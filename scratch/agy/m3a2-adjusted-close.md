# agy batch M3-A.2 — Switch prices to adjusted close + forced re-backfill

## Why (CEO decision from M3-A)
integrity_check found 28 split-suspects across 15 symbols. Root cause: `src/net/yahoo2.ts`
maps the RAW `quote.close`, so unadjusted splits + special-dividend recaps (e.g. KDP
123→22 in 2018) create fake discontinuities that would poison technicals + the M3-B
backtest. Fix: use **adjusted close** (`adjclose`), which yahoo-finance2's `chart()`
returns per-quote. Adjusted close smooths splits/dividends but correctly LEAVES real
crashes intact (e.g. APA's 2020 oil-war crash stays). This unblocks M3-B.

## The subtlety you MUST handle (data overwrite)
The existing Price rows hold RAW closes. The prices backfill uses `INSERT OR IGNORE`,
which will NOT update existing rows. Re-fetching with adjclose must OVERWRITE. So this
batch needs a FORCED re-backfill path that replaces existing closes for a symbol.

## Read first
- `src/net/yahoo2.ts` — the `chart()` type + the `mapChart`/bar-mapper (~line 135) using
  `q.close`. Confirm `adjclose` is on the quote type; if the local `chart()` type doesn't
  declare `adjclose`, add it to the type.
- `src/db/queries.ts` — `insertPrices` (INSERT OR IGNORE) + the Price row shape.
- `src/jobs/backfill.ts` — `backfillPrices10y` (PRICES_TASK, BackfillProgress) + how
  `write` persists. The forced mode must clear BackfillProgress for a symbol so it re-runs.
- `src/net/yahoo2.test.ts` — the mapper test; update its expectations for adjclose.

## Deliverables
1. `src/net/yahoo2.ts`: the daily-bar mapper prefers `adjclose` when present, falling
   back to `close` (`const close = finite(q.adjclose) ?? finite(q.close)`). Add `adjclose`
   to the local chart quote type if missing. Update `src/net/yahoo2.test.ts` accordingly
   (a fixture quote with adjclose≠close asserts adjclose is used).
2. `src/db/queries.ts`: NEW `upsertPrices(db, rows)` = `INSERT ... ON CONFLICT(symbol,d)
   DO UPDATE SET close=excluded.close, volume=excluded.volume` (chunked txns, like
   insertPrices). Keep `insertPrices` unchanged (daily heal still wants ignore-dupes).
3. `src/jobs/backfill.ts`: `backfillPrices10y` gains an optional `force?: boolean`. When
   force, it (a) uses `upsertPrices` instead of insertPrices, and (b) treats every symbol
   as not-done (ignore BackfillProgress) so the whole universe re-fetches adjusted. Add a
   test for the force path (mocked fetcher, asserts existing rows are overwritten).
4. `scripts/job.ts` OR `src/jobs/registry-live.ts`: the `prices10y` job accepts a
   `--force` flag/param that threads `force:true`. (Read how job args flow; keep the
   non-force default identical.)
5. Update `src/jobs/CLAUDE.md` note for the force path.

## Hard constraints
Do NOT touch: web/**, prisma/**, src/analyst/**, src/dossier/**, src/config/**,
src/capture/**, src/research/**, src/story/**, docs/**, package.json. Additive; no `any`.
SEQUENTIAL writes, no subagents. Do NOT commit. Do NOT run the live re-backfill yourself
(the CEO runs it after audit — it's a 20-min universe re-fetch).

## Gates
`npm run verify` exit 0. `npm run job -- --list` still lists prices10y.

## Wrap-up
Append `## Result`: files, test delta, and the exact command the CEO runs to force the
adjusted re-backfill (e.g. `npm run job -- prices10y --force`).
