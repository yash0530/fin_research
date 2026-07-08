# web/ — Next.js UI (workstation shell)

The dashboard-first UI for ENGINE. A separate Next.js 15 (App Router, React 19) app so
the dependency-light, fully-tested engine core in `../src` stays isolated — the root
`npm run verify` is never destabilized by UI deps.

## Target IA — 5 routes (P7)

Persistent left sidebar (`Sidebar.tsx`: brand, `/`-key ticker search, 5 nav items,
watchlist sparklines, run console footer) + `CaptureDrawer` (global paste-capture,
hotkey-triggered). Routes: `/` (Action Center), `/themes` (+`/themes/[code]`),
`/tickers/[symbol]` (the ticker cockpit — no index page), `/portfolio` (positions +
watchlist bands + the monthly buy-ceremony wizard), `/journal` (entry log + editor +
post-trade outcomes + mistake taxonomy + the governor/calibration console). Fourteen
retired routes (screener, discovery, signals, memos, calibration, buylist, capture,
story, live, digest, dossiers, tickers-index, + their dynamic children) redirect via
`next.config.ts` `redirects()`. See `app/CLAUDE.md` for the full route breakdown.

## On-demand runs (no automation)

The platform is on-demand only. Three kinds of buttons trigger work: **Refresh data**
(no model), **Refresh digest** (boots the model for narration), and per-symbol
**Launch Research Run** (multi-agent dossier, from the ticker cockpit sidebar). Each
mutating action's server action (`app/actions.ts`, `app/tickers/[symbol]/actions.ts`)
spawns a DETACHED `tsx scripts/job.ts … [--manage-llama]` child via `lib/run-trigger.ts`
and returns immediately — the heavy work runs OUT of the Next request, and
`--manage-llama` makes that child boot llama-server for the run and kill it after
(freeing RAM). Client islands (`components/run-ui.tsx`, `RunStatusBar.tsx`,
`ResearchRunDrawer.tsx`) poll `getRunStatusAction` (`app/actions.ts`, ~3s) for
`idle | booting | running` and `router.refresh()` on completion. A filesystem run-lock
(`@engine/jobs/run-lock`) prevents concurrent runs.

## How it relates to the engine

- Imports the **real, tested** engine via the `@engine/*` alias (`../src/*`), enabled by
  `experimental.externalDir` in `next.config.ts`. Server components/actions call
  `synthesize`, screens, `decaySignals`, `governSize`, `buildBuyList`, `impliedPrice`,
  etc. directly; **client components never import `@engine/*`** — they take plain props.
- Server components read the DB via the `node:sqlite` `openDb` (read-only) pattern in
  every `lib/*-data.ts` reader; writes go through `lib/engine-write.ts`'s
  `openWritableDb()` inside `"use server"` action files.

## Commands

- `npm run build` — `next build`: compiles + **type-checks** the app against the engine
  (this is the UI's verification gate).
- `npm run dev` / `npm start` — dev / production server.
- `npx playwright test` (or root `npm run verify:ui`) — the chromium-only Playwright
  smoke suite over the 5 routes against a temp fixture DB. See `e2e/CLAUDE.md`. Not part
  of `npm run build`/the engine's `npm run verify` — opt-in, browser-dependent.

## Layout

- `app/` — App Router routes (server components by default; client islands where needed).
- `components/` — shared UI (`Sidebar`, `SidebarWatchlist`, `TickerJump`, `CaptureDrawer`,
  `CaptureToggle`, `SourcingInbox`, `WelcomeBackBanner`, `run-ui`, `RunStatusBar`,
  `CandleChart`, `WatchlistButton`, `InversionChecklistForm`, `ResearchRunDrawer`,
  `components/ui/*` primitives, `components/story/story.css`).
- `lib/` — server-only data readers/writers (`*-data.ts` + `engine-write.ts` +
  `run-trigger.ts`/`run-status.ts`).
- `e2e/` — the Playwright smoke suite (P9a): fixture-DB builder, global setup,
  console-error guard, one spec per route. See its CLAUDE.md.
- `playwright.config.ts` — chromium-only project + `webServer` (`next start` against the
  fixture DB on a spare port); report/artifact dirs live under `os.tmpdir()`, never in
  the repo.

Build artifacts (`.next/`), `node_modules/`, and `next-env.d.ts` are gitignored.
