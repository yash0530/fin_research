# v2-4 — Spin-off tracker

Read first: `src/screens/eightk-classify.ts` (the pure 8-K item classifier + its test — extend the SAME pattern), `src/net/edgar.ts` (`parseSubmissions` form filter — note which forms are indexed: 10-K/10-Q/8-K/4/DEF 14A), `src/jobs/registry-live.ts` (`events8k` job wiring, per-symbol catch), `prisma/schema.prisma` `FilingEvent` model (kind/item/severity/headline/snippet). Conventions: `src/screens/CLAUDE.md`, `src/net/CLAUDE.md`, `src/jobs/CLAUDE.md`.

## Build

1. `src/screens/spinoff-detect.ts` — pure classifier over 8-K item lists + primary-doc text snippet (same signature style as `classify8k`): detect spin-off / separation / distribution language. Signals (regex/keyword, NO LLM): 8-K **item 2.01** (completion of disposition) combined with spin/separation keywords; item 1.01 with "separation agreement"/"distribution agreement"; explicit "spin-off", "spinoff", "tax-free distribution", "Form 10", "distribution ratio", "record date … distribution of shares". Output `SpinoffSignal | null = {kind:"spinoff-announced"|"spinoff-completed", parentSymbol, headline, snippet, confidence:"high"|"medium", recordDateHint?}`. Distinguish announced vs completed by item (2.01 → completed). Defensive: junk text → null, never throw.
2. Extend the `events8k` job in `src/jobs/registry-live.ts`: after the existing 8-K classify, also run `spinoff-detect` on the same primary-doc text; on a hit, upsert a `FilingEvent` (kind `spinoff`, severity `notable`, headline/snippet from the signal) AND merge a `spinoff` trigger tag into the parent's `Candidate.triggerTags` (never overwrite userState; per-symbol catch). No new migration — reuse FilingEvent.

## Tests & docs
`src/screens/spinoff-detect.test.ts` — fixtures: a real-style spin-off 8-K (item 2.01 + distribution language) → `spinoff-completed`; an announcement (item 1.01 + separation agreement) → `spinoff-announced`; a plain earnings 8-K → null; a false-friend ("spinning up a new datacenter") → null. Extend the events8k job test (in-memory DB + fake fetch) to assert a spinoff FilingEvent + trigger tag. Update `src/screens/CLAUDE.md`, `src/jobs/CLAUDE.md`.

## Gates (fix until green)
`npm run typecheck` · `npm test` · `npm run check:claude`. Append `## Result`. Do NOT commit. Touch only: src/screens/spinoff-detect*, src/jobs/registry-live*, affected CLAUDE.md.

## Result

Implemented a robust pure regex/keyword classifier for spin-offs in [spinoff-detect.ts](file:///Users/yash/Desktop/Programming/fin_research/src/screens/spinoff-detect.ts) and integrated it into the `events8k` job in [registry-live.ts](file:///Users/yash/Desktop/Programming/fin_research/src/jobs/registry-live.ts) to record `FilingEvent` records with kind `spinoff` and merge the `spinoff` trigger tag into the symbol's `Candidate.triggerTags` without overwriting the userState or throwing job-level errors.

All verification steps successfully completed:
- `npm run typecheck`: Green.
- `npm test`: Green (630 / 630 tests passed, including `spinoff-detect.test.ts` and the new test suite for `events8k` spinoff job integration).
- `npm run check:claude`: Green.
- No git commands were executed. All changes have been left as uncommitted working-tree changes.

