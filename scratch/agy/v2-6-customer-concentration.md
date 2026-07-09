# v2-6 — Customer-concentration extractor (from 10-K text)

Goal: a pure regex/keyword extractor that pulls customer-concentration disclosures from 10-K text (companies must disclose when a customer is ≥10% of revenue). This is honest, tractable NLP-free extraction — NOT a full customer graph (that needs relationship data we don't have; note the limit).

Read first: `src/monitor/filing-diff.ts` (the HTML-strip + paragraph-split + company-token approach — REUSE `stripHtml`/`splitParagraphs` if exported, else mirror the style), `src/screens/eightk-classify.ts` (pure classifier pattern), `src/net/edgar.ts` (fetch pattern for 10-K primary docs, 8 req/s), `src/jobs/registry-live.ts` (job wiring). Conventions: `src/screens/CLAUDE.md`, `src/monitor/CLAUDE.md`, `src/jobs/CLAUDE.md`.

## Build

1. `src/monitor/customer-concentration.ts` — pure `extractCustomerConcentration(text: string)`:
   - Strip HTML → scan for concentration-disclosure sentences. Patterns (regex, case-insensitive): "one customer accounted for (\d+)%", "customers? … represented … (\d+)% of … revenue", "(\d+)% of (?:net )?(?:total )?revenues?", "no (?:single )?customer accounted for (?:more than |10%)", named-customer patterns ("sales to (Apple|Amazon|…) …"), "our (?:largest|top) (?:three|five|ten) customers … (\d+)%".
   - Output `{disclosed: boolean, maxCustomerPct: number|null, topNPct: number|null, namedCustomers: string[], concentrationLevel: "high"|"moderate"|"low"|"none-disclosed"|"diversified", evidence: string[] /*the matched sentences, capped 3*/, warnings}`. "diversified" when the text explicitly says no customer >10%. High = maxCustomerPct ≥ 20 (or ≥10% from ≤3 named). Defensive: junk → `{disclosed:false, concentrationLevel:"none-disclosed", …}`, never throw.
2. Job `customer_concentration` in `src/jobs/registry-live.ts`: for universe symbols with a 10-K in the last 400 days, fetch the primary doc (reuse EDGAR limiter, resolve raw doc, truncate 400KB), run the extractor, and store the result as a `FilingEvent` (kind `customer-concentration`, severity = `notable` when high else `info`, snippet = top evidence) + merge a `customer-concentration-high` trigger tag into `Candidate` only when high (never overwrite userState; per-item catch). No new migration — reuse FilingEvent.

## Tests & docs
`src/monitor/customer-concentration.test.ts`: fixtures — a high-concentration 10-K ("one customer accounted for 42% of revenue" → high, maxCustomerPct 42), a diversified disclosure ("no customer accounted for more than 10%" → diversified), a named-customer case (Apple/Amazon), and boilerplate → none-disclosed. Job test (fake fetch + in-memory DB). Update `src/monitor/CLAUDE.md`, `src/jobs/CLAUDE.md`, `src/screens/CLAUDE.md` if referenced.

## Notes / honest limits
This extracts DISCLOSED concentration only (what the filer chose to state) — it is NOT a supplier/customer relationship graph. State that in the module header + CLAUDE.md; the full graph is deferred (needs external relationship data).

## Gates (fix until green)
`npm run typecheck` · `npm test` · `npm run check:claude`. Append `## Result`. Do NOT commit. Touch only: src/monitor/customer-concentration*, src/jobs/registry-live*, affected CLAUDE.md. If filing-diff's stripHtml/splitParagraphs aren't exported, export them (that's allowed) rather than duplicating.

## Result

Successfully completed the implementation:
1. Created `src/monitor/customer-concentration.ts` containing the pure regex/keyword customer-concentration extractor over 10-K filings.
2. Created unit tests in `src/monitor/customer-concentration.test.ts` covering high concentration, diversified disclosure, named customers (Apple/Amazon), and boilerplate.
3. Registered and implemented the `customer_concentration` job in `src/jobs/registry-live.ts`. It queries the latest 10-K filing in the last 400 days, fetches the document using the EDGAR limiter, limits the text size to 400KB, extracts customer concentration, inserts/updates a `FilingEvent` row, and updates/inserts `Candidate` tags when high.
4. Added integration test in `src/jobs/registry-live.test.ts` checking candidate and filing event creation.
5. Ran all check gates (`npm run typecheck`, `npm test`, `npm run check:claude`) successfully with 100% green tests (651 tests passing, types matching, and CLAUDE.md present in all directories).
6. Left all modifications as uncommitted edits, strictly obeying the hard rule of not running any git commands.
