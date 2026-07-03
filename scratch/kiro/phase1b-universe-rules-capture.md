# Kiro batch B — Full universe, tripwire rules, synthesize families, capture fidelity (NEXT_RUN 1.3–1.6)

## Intent
Finish the donor-pack ports so the deterministic spine covers the FULL market with
real rules and the complete capture contract. Faithful ports from read-only donors,
adapted to this repo's patterns (never-throw, provenance, injectable deps).

## Donor sources (READ-ONLY — never modify donor repos)
- `/Users/yash/Desktop/Programming/finance/analysis/sp500_analysis.csv` (503 rows)
- `/Users/yash/Desktop/Programming/ResearchEngine/config/sectors.ts` (131-ticker AI-infra taxonomy w/ sector links)
- `/Users/yash/Desktop/Programming/ResearchEngine/lib/rules/engine.ts` + `lib/rules/types.ts` + `config/tripwires.ts`
- `/Users/yash/Desktop/Programming/ResearchEngine/lib/research/synthesize.ts` (credit / catalysts / data-health family semantics)
- `/Users/yash/Desktop/Programming/ResearchApp/lib/seed-prompts.ts` (OUTPUT_FORMAT contract text)
- `/Users/yash/Desktop/Programming/ResearchApp/lib/parser.ts` + `/Users/yash/Desktop/Programming/ResearchApp/tests/parser.test.ts` (fixtures)

## Deliverables (ONLY these files in THIS repo)
1. **Universe (1.3):** NEW `config/sp500.csv` (copy donor CSV; keep ticker,company_name,sector,industry columns).
   MODIFY `src/lib/universe.ts` (+ its test): parse CSV rows → {symbol,name,gicsCode} via existing GICS_NAME_TO_CODE.
   MODIFY `scripts/seed.ts` + `src/db/seed-helpers.ts` (+ test): seed ALL 503 S&P tickers with GICS links + the 131 AI-infra tickers with their ai_* links (ported as a `AI_INFRA_TICKERS` data table in `src/config/sectors.ts` — faithful to donor membership; dedupe symbols present in both; AI membership is additive). Seed stays idempotent (upserts). Console summary must report counts.
2. **Tripwires (1.4):** NEW `src/rules/engine.ts`, `src/rules/types.ts`, `src/rules/engine.test.ts`; NEW `src/config/tripwires.ts`. Port donor semantics: pure evaluators over an injectable `RuleContext`, per-rule cooloff, fired → `RuleEvent` rows via NEW helpers in `src/db/queries.ts` (insertRuleEvent, recentRuleEvents — RuleEvent table already exists in prisma/migrations). Rules must be config data, not hardcoded logic.
3. **Synthesize families (1.5):** MODIFY `src/research/synthesize.ts` (+ test): add `credit` (HYG/IEF ratio trend), `catalysts` (next-7-day window), `data_health` (stale-price count, failed JobRuns, suspect despiked ticks) families following donor semantics; extend the Insight family union; provenance string on EVERY insight; per-family caps preserved; tripwire family now accepts persisted RuleEvents as input.
4. **Capture (1.6):** MODIFY `src/capture/render.ts`: embed the FULL donor OUTPUT_FORMAT contract text (all 10 arrays incl. enum vocab + confidence 1–5 + mandatory discoveries rule + shape example). MODIFY `src/capture/parse.ts` ONLY if fixtures expose gaps. NEW fixture-based tests in `src/capture/` ported from the donor parser tests (both fenced-JSON and legacy pipe-block cases).
5. Each NEW directory gets a CLAUDE.md (src/rules/). Update existing CLAUDE.md module maps where a directory's contents changed (src/config, src/research, src/capture, src/db, src/lib — one line each).

## Hard constraints
- Do NOT touch: `TASKS.md` (CEO updates it at integration), `src/analyst/**`,
  `src/config/providers.ts`, `src/config/settings.ts`, `src/dossier/**`, `web/**`,
  `prisma/**` (schema is fixed; only queries.ts helpers), `package.json` (no new deps).
- Never-throw discipline everywhere; market dates as YYYY-MM-DD strings.
- Do NOT commit.

## Gates (from repo root; fix until green)
- `npm run verify`
- `npm run seed` → must print ≥600 tickers, 23 sectors, ≥700 links (run against a
  scratch DATABASE_URL, e.g. `DATABASE_URL=file:./data/seed-check.db npm run seed`,
  then delete that db file).

## Wrap-up
Append `## Result`: file list, test count before/after, seed counts observed, any
donor semantics adapted/skipped and why. Do NOT commit.
