# fin_research — ENGINE (unified local-first investment research platform)

Personal investing **research** workstation that unifies three prior projects
(Edge Terminal · Signal Desk · ENGINE) into one. It supports deploying $2,500/month
of real capital: a full-market morning digest, on-demand multi-agent deep-dive
"dossiers", discovery/screening, a monthly buy-list ritual with a calibration
governor, and a paste-capture web-research channel — all local-first on Qwen 3.6 27B,
operating cost ≈ $0.

> **Hard prohibition: no broker APIs, no order placement, no trade execution code —
> anywhere, ever.** This tool produces research, not investment advice.

## What lives here

This repo is the **portable, deterministic brain** of the platform, built as a
dependency-light, fully-tested TypeScript core (the parts that must be provably
correct without a live LLM or network). Live-service adapters (Qwen HTTP, Yahoo,
EDGAR) and the Next.js UI are specified with real interfaces and driven in tests by
fakes/mocks. See `TASKS.md` for the full build checklist and `docs/dev_guide.md`.

## Governing invariants (do not violate)

1. **Deterministic-synthesis-first.** Every insight traces to a computed number or a
   dated source (provenance). The LLM only *narrates* already-true facts.
2. **Accuracy > latency.** A correct answer that takes longer beats a fast guess.
3. **Despike at every read path.** Bad ticks never become signal (`src/lib/metrics.ts`).
4. **Jobs never crash.** Catch per item; a failed item is counted, not fatal.
5. **Human-gated stage changes.** The engine proposes; a human applies.
6. **Market dates are `YYYY-MM-DD` strings**; audit timestamps are real datetimes.
7. **Local-first, model-swappable.** All LLM calls go through `completeJson()` under a
   per-endpoint `withLlmLock`; routing is per-role config (`src/config/settings.ts`).
8. **Every directory has a CLAUDE.md**, kept current in every commit
   (`npm run check:claude`).

## Stack

TypeScript (strict) · zod · vitest · tsx. (The full product also targets
Next.js 15 / Prisma 6 / SQLite (WAL) — see `prisma/` and `docs/`.)

## Commands

- `npm run verify` — typecheck + full test suite + CLAUDE.md coverage (the gate)
- `npm test` — vitest run
- `npm run typecheck` — `tsc --noEmit`
- `npm run check:claude` — assert CLAUDE.md in every directory

## Layout (see each directory's CLAUDE.md)

- `src/analyst/` — LLM plumbing: `jsonsafe`, `completeJson` harness, per-endpoint lock, provider abstraction, FakeProvider
- `src/lib/` — pure primitives: despike, metrics
- `src/config/` — providers (profiles + capabilities), settings (role routing), sectors (dual taxonomy)
- `src/tools/` — evidence ledger, budget, cache, registry + ported quant tools
- `src/screener/` — full-universe screening engine
- `src/dossier/` — multi-agent debate engine (resumable, single-flight)
- `src/research/` — deterministic digest synthesis
- `src/calibration/` — sizing governor + outcomes
- `src/buylist/` — monthly allocation
- `src/capture/` — paste-capture parser + prompt renderer
- `src/story/` — editorial story-page composer
- `prisma/` — schema + hand-written migrations
- `docs/` — dev guide + user docs
- `scripts/` — tooling (CLAUDE.md coverage, migrations)
