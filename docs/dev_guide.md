# ENGINE — Developer Guide

This guide is for anyone (human or agent) extending the codebase. It explains the architecture, the non-negotiable invariants, how each module fits, and how to add new tools, agents, and providers without breaking the guarantees.

---

## 1. What this repository is

The **deterministic brain** of a local-first investment **research** platform, built as a dependency-light, strictly-typed, fully-tested TypeScript core. It is deliberately scoped so that everything that must be *provably correct without a live LLM or the network* is unit-tested here. Live-service adapters (Qwen HTTP, Yahoo, EDGAR) and the Next.js UI wrap these interfaces and are driven in tests by fakes/mocks.

> **Research, not advice. No broker APIs, no order placement, no execution code — ever.**

Ground truth for scope and status: [`../TASKS.md`](../TASKS.md).

---

## 2. The invariants (do not violate)

These hold across every module and every commit:

1. **Deterministic-synthesis-first.** Insights are computed from stored facts and carry an `evidence` provenance string. The LLM only *narrates* already-true facts — it never originates a number. See `src/research/synthesize.ts`.
2. **Accuracy > latency.** Prefer a correct-but-slower path. The full multi-agent debate always runs (no quick-take tier); thinking-mode is ON for reasoning agents.
3. **Despike at every price read path.** `src/lib/metrics.despike` (rolling median) cleans bad ticks before any metric is computed. Never mutate the stored series.
4. **Jobs never crash.** Tools go through `execute()` (never-throw); a failed item is recorded, not fatal. The dossier judge falls back to HOLD/LOW rather than throwing.
5. **Human-gated stage changes.** The engine proposes (StageHistory, staged MemoVersion); a human applies.
6. **Market dates are `YYYY-MM-DD` strings**; audit timestamps are `DateTime`.
7. **Local-first, model-swappable.** Every LLM call goes through `completeJson()` under a per-endpoint `withLlmLock`. Routing is per-role config (`src/config/settings.ts`).
8. **Every directory carries a CLAUDE.md**, current in every commit (`npm run check:claude`, part of `npm run verify`).
9. **Migrations are additive, hand-written SQL** via `scripts/apply-migration.ts`.

---

## 3. Architecture & Topology

For detailed system context, overnight pipeline, and LLM contract diagrams, see the [Architecture Guide](architecture.md).

### Process Topology
The platform target consists of three main processes running on a single machine:
1. **Next.js Web Process** (`web/`): Reads database state and handles light server-action mutations (e.g., morning read, queuing dossiers, logging buys).
2. **Scheduler Daemon**: Runs background crons, catches up on wake, and drains the dossier queue. Owns all heavy writes.
3. **llama-server**: Runs locally at `localhost:8000` (serving Qwen 3.6 27B). Serializes all LLM calls via a single-flight lock (`withLlmLock`) to prevent concurrent model thrashing.

All processes read and write to a single **SQLite database** (in WAL mode) at `data/engine.db`.

---

## 3.1 Developer Commands Reference

Use these verified commands during setup, development, and testing. Do not invent custom flags or commands.

### Environment & Database Setup
- **Initialize & Seed:**
  ```bash
  npm install
  npm run seed
  ```
  *Note:* `.env` requires `DATABASE_URL` (defaults to `file:./data/engine.db`) and `EDGAR_USER_AGENT="Name email"`. `npm run seed` is idempotent and loads 563 tickers and the 23-sector dual-taxonomy.

- **Apply DB Migration:**
  ```bash
  tsx scripts/apply-migration.ts
  npx prisma validate
  ```

### Verification & Testing
- **Run Verification Gate:**
  ```bash
  npm run verify
  ```
  *Runs full type-checking, tests, and CLAUDE.md checks. Must pass before committing.*

- **Run Tests:**
  ```bash
  npm test
  ```

- **Type-Check:**
  ```bash
  npm run typecheck
  ```

- **Check CLAUDE.md presence:**
  ```bash
  npm run check:claude
  ```

- **Run the Playwright web smoke suite** (chromium-only, 5 live routes against a temp
  fixture SQLite DB — never `data/engine.db`; NOT part of `npm run verify`, kept
  separate so that gate never grows a browser dependency):
  ```bash
  npx playwright install chromium   # once
  npm run verify:ui                 # web build + playwright test
  ```
  See `web/e2e/CLAUDE.md` for how the fixture DB is built and what each spec asserts.

### Background Jobs & Dossiers
- **EDGAR Index Backfill:**
  ```bash
  npm run job -- edgar_index
  ```
- **10-Year Price Backfill:**
  ```bash
  npm run job -- prices10y
  ```
- **Fundamentals Backfill:**
  ```bash
  npm run job -- fundamentals
  ```
- **Overnight Daily Job:**
  ```bash
  npm run job -- overnight
  ```
- **Run deep-dive Dossier:**
  ```bash
  npm run job -- dossier --symbols=MU
  ```

### Web Development
- **Run local Next.js server:**
  ```bash
  cd web && npm run dev
  ```

---

## 4. Module tour

Each directory has a `CLAUDE.md` with specifics. High level:

- **`src/analyst/`** — the LLM path. `completeJson(provider, msg, schema, opts)` is the only way to get structured output: `jsonsafe` salvage → `zod.safeParse` → retry with the validation error appended → `LlmJsonError` after `maxAttempts`. `withLlmLock` serializes calls per endpoint (`-np 1`). `FakeProvider` drives tests.
- **`src/lib/metrics.ts`** — `despike`, `median`, `pctChange`, `maxDrawdownPct`.
- **`src/config/`** — `PROVIDER_PROFILES` (with `contextWindow`/`thinkingMode`), `settings.models` (per-role `default` + `overrides`), `resolveProfile`, `thinkingForRole`, and the dual sector taxonomy.
- **`src/tools/`** — the evidence substrate (`ToolResult`, `execute`, `EvidenceLedger`, `Budget`, `ToolCache`, `ToolRegistry`) and the pure quant tools.
- **`src/dossier/`** — the debate state machine (`runDossier`), agent functions, schemas, `classify`, evidence-validation, and the queue.
- **`src/research/synthesize.ts`** — the deterministic digest.
- **`src/screener/`, `src/calibration/`, `src/buylist/`, `src/capture/`, `src/story/`** — the surfaces described in TASKS.md.

---

## 5. How to extend

### Add a tool
1. Implement the pure math as an exported function (golden-testable) in `src/tools/`.
2. Wrap it as a `Tool` (`name`, `describe()`, `run(args)`) — `run` may throw; the pipeline always calls `execute()`.
3. Register it in the `ToolRegistry` the runner receives. It now appears in `promptCatalog()` for the planner.
4. Add a vitest with golden values (hand-derive them, don't snapshot LLM output).

### Add a dossier agent
1. Define its zod schema in `src/dossier/schemas.ts` (flat — local models format flat shapes far more reliably).
2. Add a `runX(provider, ctx, …)` in `agents.ts` that calls `completeJson` with the schema and the right `thinking` flag.
3. Wire a stage into `runner.ts` (persist its output; make it resumable by guarding on `state.stages.<name>`).
4. Test it against `FakeProvider` with a scripted output.

### Add a provider (e.g. a second local model)
1. Add a profile to `PROVIDER_PROFILES` with `contextWindow` + `thinkingMode`.
2. Point a role at it: `settings.models.overrides = { narrator: "gemma4_local" }`. No code change. The per-endpoint lock lets it run concurrently with Qwen.
   *(Memory note: 64 GB can't hold two Q8 models resident — run the second at a smaller quant on its own port, or swap on demand.)*

### Add a migration
Write additive SQL under `prisma/migrations/NNNN_name.sql` and apply via `scripts/apply-migration.ts`. Update `schema.prisma` to match and run `npx prisma validate`.

---

## 6. Testing strategy

- **Pure logic** (metrics, quant, governor, allocation, synthesis, screener, parser) — golden tests with **hand-derived** reference values (e.g. Beneish M = −2.3735, Altman Z = 4.455, DCF $100, buy-list $300/$200 with $2000 cash).
- **The LLM pipeline** — driven end-to-end by `FakeProvider` (scripted per role), so the dossier engine's happy path, resume, budget exhaustion, uncited-claim drop, and judge fallback are all deterministic and network-free.
- **Injectable seams** — clock (`Budget`, `ToolCache`), store (`DossierStore`), and `providerFor(role)` make time, persistence, and models test-controllable.

Run `npm run verify` (tsc + vitest + CLAUDE.md coverage) before every commit.

---

## 7. What is intentionally not here yet

Live adapters and UI (marked in TASKS.md as `[~]`/`(live-service)`/`(UI layer)`): the Qwen/anthropic HTTP transport, the Yahoo/EDGAR backfill jobs, the Next.js pages, and the scheduler daemon. Their **logic** lives here behind interfaces (`Provider`, `DossierStore`, `Tool`) and is tested with fakes; wiring them to live I/O is the remaining integration work. This is a deliberate, honest boundary — the hard, portable, correctness-critical core is complete and verified.
