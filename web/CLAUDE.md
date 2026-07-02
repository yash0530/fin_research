# web/ — Next.js UI (workstation shell)

The dashboard-first UI for ENGINE. A separate Next.js 15 (App Router, React 19) app so
the dependency-light, fully-tested engine core in `../src` stays isolated — the root
`npm run verify` is never destabilized by UI deps.

## How it relates to the engine

- Imports the **real, tested** engine via the `@engine/*` alias (`../src/*`), enabled by
  `experimental.externalDir` in `next.config.ts`. Pages call `synthesize`, `runScreen`,
  `buildBuyList`, `impliedPrice`, `renderPrompt`, etc. directly.
- Demo pages currently render **fixture data** (`lib/demo.ts`) passed *through* those real
  functions — this proves the engine↔render integration compiles and is deterministic.
  Wiring to live Prisma reads is the remaining app-layer work (see `../TASKS.md`).

## Commands

- `npm run build` — `next build`: compiles + **type-checks** the app against the engine
  (this is the UI's verification gate; it passes — 8 routes).
- `npm run dev` / `npm start` — dev / production server.

## Layout

- `app/` — App Router routes (server components by default; one client component).
- `components/` — shared UI (`InsightList`, `ScenarioEstimator`).
- `lib/` — `demo.ts` fixtures.

Build artifacts (`.next/`), `node_modules/`, and `next-env.d.ts` are gitignored.
