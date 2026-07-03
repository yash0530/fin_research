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
- **Story pages** (`app/story/[id]/`) read from the SQLite DB via `lib/story-data.ts`
  (following the `lib/live.ts` pattern) or fall back to `demoStory()` from
  `lib/story-types.ts`. The story UI is self-contained — it uses mirrored types and
  does not import from `@engine/*`.

## Commands

- `npm run build` — `next build`: compiles + **type-checks** the app against the engine
  (this is the UI's verification gate).
- `npm run dev` / `npm start` — dev / production server.

## Layout

- `app/` — App Router routes (server components by default; client islands where needed). Added `/tickers` (universe index), `/tickers/[symbol]` (asset cockpit), `/screener` (real engine screener), `/discovery` (candidate queue), `/signals` (RuleEvent history), and `/journal` (JournalEntry log).
- `components/` — shared UI (`InsightList`, `ScenarioEstimator`, `TickerPriceChart`, `story/*`).
- `lib/` — `demo.ts` engine fixtures, `live.ts` live digest reader,
  `digest-types.ts`/`digest-data.ts` live digest SQLite reader,
  `dossier-types.ts`/`dossier-data.ts` live dossier SQLite reader,
  `story-types.ts` mirrored StoryPageData types + `demoStory()`,
  `story-data.ts` SQLite reader for StoryPage rows,
  `ticker-data.ts` SQLite reader for the 563-ticker universe and cockpits,
  `screener-data.ts` SQLite data assembler for screener rows (RSI via `@engine/tools/technicals`, despike via `@engine/lib/metrics`); scoring delegated to `@engine/screener/engine.runScreen()`,
  `discovery-data.ts` SQLite reader for discovery queue candidates,
  `signals-data.ts` SQLite reader for RuleEvent rows,
  `journal-data.ts` SQLite reader for JournalEntry rows,
  `despike.ts` manual mirror of the rolling-median despike function (used by ticker-data.ts; screener-data.ts now imports from @engine/lib/metrics).

Build artifacts (`.next/`), `node_modules/`, and `next-env.d.ts` are gitignored.
