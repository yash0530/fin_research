# Kiro batch D — Dossier LIVE integration (NEXT_RUN Phase 3 enabler)

## Intent
Everything needed so the CEO can run `npm run job -- dossier --symbols=MU` and get a
REAL end-to-end deep dive: queued dossier → production tool registry over the real
(seeded + backfilled) DB → live Qwen via HttpProvider(qwen_local) → persisted stages
→ verdict + governed RecCall row. The engine pieces all exist and are tested with
fakes; this batch does the PRODUCTION WIRING. Do not redesign anything.

## Verified context
- llama-server healthy at :8000 (watchdog in scheduler); provider thinking contract
  hardened (`completeJson` handles ThinkingBudgetExhausted; thinking per role via
  `src/config/settings.thinkingForRole`).
- DB (data/engine.db): 563 tickers seeded; Price backfill in progress (~119k+ rows,
  growing); EdgarFiling backfilling. Jobs CLI (`scripts/job.ts`) loads .env and owns
  the registry.
- `src/dossier/`: runner (resumable, single-flight, budget), queue (enqueue/dedupe/
  drainOnce/recoverStale), state.ts (DossierStore interface + InMemory impl; check
  `src/db/sqlite-store*` — run 1 proved a SQLite-backed store; REUSE it, extend only
  if a method is missing).
- `src/tools/`: registry + quant tools tested over plain inputs; the production
  binding to the real DB does not exist yet — that's this batch.

## Deliverables
1. NEW `src/tools/factory.ts` (+ factory.test.ts against a temp migrated DB):
   `buildProductionRegistry(db: SqlDb, opts)` returning a ToolRegistry where every
   tool works against the real schema:
   - Local-data tools (NO network): price_history (despiked closes from Price),
     technicals, relative_rank, sector_heat, fundamentals, financial_trends, qoe,
     dcf, peer_compare, catalysts, news_tape (NewsItem), macro (benchmark closes).
   - Live tools (injectable fetcher, degrade gracefully to low-confidence error
     results when offline): quote_snapshot, movers (yahoo2 quote), sentiment,
     insider_form4 + institutional + options_metrics (existing net fetchers/parsers).
   - Every ToolResult keeps sources[] + honest confidence; missing data → explicit
     `data_status: "partial"|"missing"` note, never silent empties.
2. Dossier persistence: wire the SQLite DossierStore into the job path (reuse the
   existing implementation; if a persistence gap exists — e.g. a table missing from
   prisma/migrations — ADD an additive migration `000N_*.sql` + matching
   schema.prisma model, following 0002_rule_event.sql's pattern. Document any drift
   found in ## Result).
3. NEW `dossier` job registered in `scripts/job.ts`:
   `npm run job -- dossier --symbols=MU[,NVDA]` → enqueue (dedupe) then drain one at
   a time; `npm run job -- dossier` with no symbols → drain existing queue only.
   Wiring: HttpProvider from `resolveProfile(role)` + real fetch + `withLlmLock`;
   memoSummary loaded from the Memo table (null-safe); currentPrice from Ticker
   stats (fallback: latest Price close); budget from `settings.dossier`; governSize
   from `src/calibration/governor` (history-aware if RecCall rows exist); on
   completion persist the RecCall row and print a verdict summary
   (recommendation/conviction/size/governed/stages/wall-clock).
4. Console progress: the job logs each stage transition with elapsed seconds (the
   CEO watches a 20-45 min run; silence is unacceptable).
5. Tests (network-free): factory over a temp DB with seeded fixture rows (each local
   tool returns real computed data + sources); dossier job path with FakeProvider +
   temp DB (enqueue → run → stages + RecCall persisted; resume path with a
   pre-populated done stage).
6. CLAUDE.md updates: src/tools, src/dossier, scripts.

## Hard constraints
- Do NOT touch: web/** (agy is working there CONCURRENTLY — absolute wall),
  package.json/lock, TASKS.md, src/analyst/**, src/dossier/prompts/**,
  src/config/providers.ts, src/rules/**, src/capture/**, src/research/**,
  docs/**, scratch/agy/**.
- prisma/** additive migrations ONLY as described in deliverable 2.
- No live network or LLM in vitest.
- Do NOT commit.

## Gates
- `npm run verify` green.
- `npm run job -- --list` shows `dossier`.

## Wrap-up
Append `## Result`: files, test delta, any drift/migrations added, and the exact
command + expected runtime for the CEO's live MU dossier. Do NOT commit.

## Result

Live dossiers are wired end-to-end. `npm run verify` is green (316 tests, 49 files;
typecheck clean; CLAUDE.md present in all 44 directories) and `npm run job -- --list`
now shows `dossier`.

### Files
- **NEW `src/tools/factory.ts`** — `buildProductionRegistry(db, opts)`: an 18-tool
  `ToolRegistry` bound to the real schema.
  - Local (no network): `price_history`, `technicals`, `fundamentals`,
    `financial_trends`, `qoe`, `dcf`, `relative_rank`, `sector_heat`, `peer_compare`,
    `catalysts`, `news_tape`, `macro`.
  - Live (injected `LiveFetchers`, degrade gracefully offline): `quote_snapshot`,
    `movers`, `sentiment`, `insider_form4`, `institutional`, `options_metrics`.
  - Every `ToolResult` carries `sources[]` + honest `confidence` + an explicit
    `data_status: "ok"|"partial"|"missing"` — never a silent empty.
- **NEW `src/tools/factory.test.ts`** — 17 tests over a temp migrated DB with seeded
  MU fixtures (each local tool returns real computed data + sources; live tool uses an
  injected fetcher; graceful-degrade paths for offline + throwing fetchers).
- **NEW `src/dossier/job.ts`** — `runDossierJob(db, symbols, deps)`: enqueue (dedupe) →
  drain oldest-first one at a time → per dossier build the production registry, pull
  `currentPrice` (latest Price close), `memoSummary` (Memo table, null-safe) and the
  history-aware `calibration/governor`, run `runDossier`, persist the governed `RecCall`,
  print a verdict summary. Factored out of the CLI so it's FakeProvider-testable.
- **NEW `src/dossier/job.test.ts`** — 3 tests (run→stages+governed RecCall persisted ·
  dedupe · resume from a pre-populated done stage), all network-free via `FakeProvider`.
- **EDIT `src/dossier/runner.ts`** — added an optional `onStage(name, at)` hook to
  `RunnerDeps`, fired once per stage as it first completes (console progress; no behavior
  change when omitted, so all existing runner tests stay green).
- **EDIT `scripts/job.ts`** — registered the `dossier` job: `liveProviderFor(role)` =
  `HttpProvider(resolveProfile(role))` over real `fetch`; `liveFetchers()` wires yahoo2
  `quotes` (quote_snapshot/movers) + `ownershipJson` (institutional); delegates the flow
  to `runDossierJob` and prints a per-symbol summary + 0/1 exit.
- **NEW `prisma/migrations/0003_dossier_state.sql`** (see drift below).
- **CLAUDE.md** updated: `src/tools`, `src/dossier`, `scripts`, `prisma/migrations`.

### Test delta
+20 tests (17 factory + 3 dossier-job): 296 → **316**, all green. No existing tests
changed; the `runner.onStage` addition is backward-compatible.

### Drift / migrations
- **Migration `0003_dossier_state.sql` (additive):** the durable `DossierStore`
  (`src/db/sqlite-store.ts`) persists to a self-managed `_dossier_state` table via a
  runtime `CREATE IF NOT EXISTS` guard — it was never captured in `prisma/migrations`.
  Added the migration (mirrors the guard exactly; applying it where the store already ran
  is a no-op — verified: applies cleanly to a fresh DB alongside 0001/0002). Following the
  `_migrations` convention, this INTERNAL underscore-prefixed table is intentionally **not**
  a `schema.prisma` model (Prisma cannot own an underscore table) — that is the one
  deviation from the "matching schema.prisma model" note in deliverable 2, and it is
  deliberate.
- **No `price` column on `Ticker`:** `currentPrice` is taken from the **latest Price
  close** (`tools/factory.latestClose`). The schema has no ticker price stat, so the
  spec's "Ticker stats (fallback: latest Price close)" collapses to the fallback.
- **`qoe` is honestly `partial`:** the local `FundamentalsQuarter` lacks the canonical
  Beneish/Altman/Piotroski inputs (receivables, PPE, retained earnings, CFO, SGA,
  depreciation, current assets/liabilities). The tool returns an FCF-based accrual proxy
  + the list of unavailable inputs at low confidence rather than fabricating scores.
- **Live coverage:** `quote_snapshot`, `movers`, `institutional` are wired to existing
  yahoo2 adapters. `sentiment`, `options_metrics`, `insider_form4` have no existing net
  adapter yet, so they degrade to low-confidence `data_status:"missing"` (never crash the
  debate). The local tools carry the bulk of the evidence.

### CEO's live MU dossier
Preconditions: llama-server healthy at `:8000` (the scheduler watchdog keeps it up),
price/fundamentals backfill populated for MU, and (optional) `EDGAR_USER_AGENT` in `.env`.
Apply the new migration once (idempotent) before the first run:

```bash
tsx scripts/apply-migration.ts        # applies 0003_dossier_state (no-op if present)
npm run job -- dossier --symbols=MU    # live end-to-end deep dive
```

Expected runtime **≈ 20–45 min** wall-clock (bounded by `settings.dossier.maxWallClockSec`
= 2700s; 8–10 live Qwen calls with thinking ON across planner→bull→bear→rebuttal→judge→
critique→memo). The console logs each stage transition with elapsed seconds, then prints
the verdict summary (recommendation/conviction, judge size → governed size, stage count,
wall-clock) and persists the governed `RecCall`. Not committed.

