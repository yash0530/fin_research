# fin_research — ENGINE

A unified, **local-first** investment **research** workstation. It merges three prior
projects (Edge Terminal, Signal Desk, ENGINE) into one platform that supports deploying
$2,500/month of real capital — full-market morning digest, on-demand multi-agent
deep-dive dossiers, discovery/screening, a monthly buy-list ritual with a calibration
governor, and a paste-capture web-research channel. Runs on a local Qwen 3.6 27B;
operating cost ≈ $0.

> **Research, not advice. No broker APIs, no order placement, no execution code — ever.**

## Quickstart

```bash
npm install
npm run verify   # typecheck + tests + CLAUDE.md coverage
```

Expected: `tsc` clean, the vitest suite green, and `✓ CLAUDE.md present in all N directories`.

## What's in this repo

The **deterministic brain** of the platform as a dependency-light, fully-tested
TypeScript core — the parts that must be provably correct without a live LLM or the
network:

- **LLM-JSON harness** (`src/analyst`): `completeJson` (jsonsafe → zod → retry), a
  per-endpoint single-flight lock, and a `FakeProvider` that drives the whole
  multi-agent engine deterministically in tests.
- **Quant tools** (`src/tools`): DCF, financial trends, technicals, and QoE forensics
  (Beneish / Altman / Piotroski / accruals) with golden tests.
- **Dossier engine** (`src/dossier`): a resumable, single-flight bull/bear/judge debate
  with citation enforcement and a never-crash judge fallback.
- **Synthesis** (`src/research`): deterministic digest families with provenance on every insight.
- **Calibration governor** (`src/calibration`) + **buy-list allocation** (`src/buylist`).
- **Paste-capture parser** (`src/capture`) and **story-page composer** (`src/story`).

Live adapters (Qwen HTTP, Yahoo, EDGAR) and the Next.js UI are specified with real
interfaces and exercised via fakes/mocks. `TASKS.md` tracks every task and its true status.

## Docs

- `TASKS.md` — the master build checklist.
- `docs/dev_guide.md` — architecture, conventions, how to extend (add a tool, an agent, a provider).
- `docs/user/` — end-user guide: getting started, the daily workflow, dossiers, the monthly buy-list ritual, the capture channel, FAQ.
- Every directory has a `CLAUDE.md` describing its contents and invariants.

## Layout

```
src/analyst      LLM plumbing (jsonsafe, completeJson, lock, providers, fake)
src/lib          pure primitives (despike, metrics)
src/config       providers, settings (role routing), sectors (dual taxonomy)
src/tools        evidence ledger, budget, cache, registry + quant tools
src/screener     full-universe screening
src/dossier      multi-agent debate engine
src/research     deterministic digest synthesis
src/calibration  sizing governor + outcomes
src/buylist      monthly allocation
src/capture      paste-capture parser + prompt renderer
src/story        editorial story-page composer
prisma           schema + migrations
docs             dev guide + user docs
scripts          tooling
```
