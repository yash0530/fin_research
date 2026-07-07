# P2 — EDGAR event bus: Form 4 insider clusters + 8-K regex classifier

Read first: `/Users/yash/.claude/plans/linear-mapping-blossom.md` (v1 signal set items 4-5, phase P2). Conventions: `src/net/CLAUDE.md` (rate limiter, fetchers), `src/jobs/CLAUDE.md` (never-crash jobs), existing `src/net/edgar.ts`/`edgar-facts.ts` for EDGAR fetch patterns (8 req/s limiter, User-Agent), `src/jobs/registry-live.ts` for job wiring.

## Build

1. Migration `prisma/migrations/0008_edgar_events.sql` + schema models (additive):
   - `InsiderTx(id INTEGER PK AUTOINCREMENT, symbol TEXT, filerName TEXT, filerRole TEXT, txDate TEXT, code TEXT, shares REAL, price REAL, value REAL, sharesOwnedAfter REAL, tenPercentOwner INTEGER, tenB51 INTEGER, accessionNo TEXT UNIQUE, filedAt TEXT)` + index on (symbol, txDate)
   - `FilingEvent(id INTEGER PK AUTOINCREMENT, symbol TEXT, accessionNo TEXT, form TEXT, item TEXT, kind TEXT, headline TEXT, snippet TEXT, severity TEXT, filedAt TEXT, UNIQUE(accessionNo, item))` + index on (symbol, filedAt)

2. `src/net/edgar-form4.ts` — fetch+parse Form 4 XML by accession (the EdgarFiling table already indexes form-4 filings w/ accessionNo+cik+primaryDoc): extract non-derivative transactions; keep transaction code `P` only; detect 10b5-1 (footnote text match) and 10% owner flags; return typed rows. Injectable fetch (like other src/net modules) so tests use fakes. Parse defensively — malformed XML returns [] with a warning, never throws.

3. `src/screens/insider-cluster.ts` — pure: given InsiderTx rows + marketCap, apply **market-cap-scaled cluster rule**: cap>$20B → ≥2 distinct insiders AND total ≥$500k; else ≥3 distinct AND ≥$100k; 30-day rolling window; exclude 10b5-1 and passive 10% owners. Output `{clustered: boolean, windowStart, insiders, totalValue, warnings}`.

4. 8-K classifier `src/screens/eightk-classify.ts` — pure regex/keyword classifier over 8-K item lists + primary-doc text snippet: map items 1.01→"material-agreement", 2.02→"results/guidance" (also regex for raising/lowering/withdraw guidance → kind "guidance-up"/"guidance-down"), 4.02→"non-reliance" severity "critical", 5.02→"exec-change". Everything else ignored. NO LLM here.

5. Jobs in `src/jobs/registry-live.ts`:
   - `form4` — for universe symbols with EdgarFiling form "4" filed in the last 90 days: fetch/parse via edgar-form4, upsert InsiderTx (INSERT OR IGNORE on accessionNo), then run insider-cluster per symbol and merge an `insider-cluster` trigger tag into `Candidate.triggerTags` (never overwrite userState). Catch per symbol.
   - `events8k` — for universe symbols with EdgarFiling form "8-K" filed in the last 30 days: fetch primary doc text (truncate 20KB), classify, upsert FilingEvent. 4.02 rows get severity critical. Catch per symbol.

## Tests & docs
Fixture tests: form4 parser (sample XML fixture incl. a 10b5-1 footnote + a code-M to reject), cluster rule both cap regimes + window edge, 8-K classifier per item + guidance direction regexes, job tests with in-memory DB + fake fetch (follow registry-live.test.ts). Update `src/net/CLAUDE.md`, `src/screens/CLAUDE.md`, `src/jobs/CLAUDE.md`, `prisma/migrations/CLAUDE.md`.

## Gates (fix until green)
`npm run typecheck` · `npm test` · `npm run check:claude`. Append `## Result` here. Do NOT commit. Touch only: src/net/edgar-form4*, src/screens/{insider-cluster,eightk-classify}*, src/jobs/registry-live*, prisma/*, affected CLAUDE.md files.

## Result

- **Database Migration (`prisma/migrations/0008_edgar_events.sql` + `schema.prisma`)**: Created `InsiderTx` and `FilingEvent` tables with correct datatypes, unique constraints, and indexes. Applied successfully to local database, and regenerated the Prisma client.
- **Form 4 Parser (`src/net/edgar-form4.ts`)**: Built a robust XML parser to extract non-derivative transaction purchases (code `P`), trace recursive footnote references to identify Rule 10b5-1 plan trades, extract filer roles, and check 10% ownership status.
- **Insider Cluster Screen (`src/screens/insider-cluster.ts`)**: Implemented a pure rolling 30-day window detector with a market-cap-scaled clustering rule:
  - Market Cap > $20B: requires ≥ 2 distinct insiders and total value ≥ $500k.
  - Market Cap ≤ $20B: requires ≥ 3 distinct insiders and total value ≥ $100k.
  - Excluded passive 10% owners (10% owner role without director/officer role) and transactions under 10b5-1 plans.
- **8-K Regex Classifier (`src/screens/eightk-classify.ts`)**: Built a pure regex classifier mapping reported items:
  - 1.01 → `material-agreement` (severity `info`)
  - 2.02 → `results/guidance` (checks text snippet for guidance direction to map to `guidance-up` or `guidance-down`)
  - 4.02 → `non-reliance` (severity `critical`)
  - 5.02 → `exec-change` (severity `info`)
- **Overnight Job Integration (`src/jobs/registry-live.ts`)**: Integrated the `form4` and `events8k` jobs into the overnight pipeline with robust retry/catch-per-symbol behaviors, merging `"insider-cluster"` tags and qualifications into `Candidate.triggerTags` and `Candidate.qualification` respectively.
- **Unit & Integration Tests**: Wrote comprehensive tests covering parser fixtures (10b5-1 plan detection, code-M exclusion), cluster rule cap regimes and window limits, 8-K regex directions, and in-memory job execution mocks (mocking global fetch).
- **Quality Gates Verification**: Verified that all checks (`npm run typecheck`, `npm test`, `npm run check:claude`) compile and pass successfully, with all 487 tests green.

