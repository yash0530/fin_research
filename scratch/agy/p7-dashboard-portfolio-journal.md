# P7 — Dashboard + Portfolio + Journal rebuilds, route deletions

Read first: `/Users/yash/.claude/plans/linear-mapping-blossom.md` (Target IA rows `/`, `/portfolio`, `/journal` + phase P7 + "Deleted routes" line + rituals section), design spec brain file `/Users/yash/.gemini/antigravity-cli/brain/7e5cfbbc-c1ed-4103-900e-d8887dd3d45d/design_system_spec.md`, existing readers `web/lib/{portfolio,calibration,buylist,journal,digest,discovery}-data.ts`, engines `src/portfolio/decay.ts`, `src/calibration/governor.ts`, `src/buylist/build.ts`, `src/rules/engine.ts`, `src/config/tripwires.ts`.

## Build — pages (use `web/components/ui/` primitives everywhere; every panel has a real EmptyState)

1. **`/` Action Center** — rebuild `web/app/page.tsx` (server): header micro-strip (portfolio size vs governor cap from calibration-data). Left column (daily): tripwire/decay alerts (decay engine over held names + rules engine events), watchlist names in/near buy band (distance = close vs WatchlistEntry.buyUnder; empty state: "closest to trigger: X +2.4%"), upcoming catalysts (7d). Right column (weekly): **Sourcing Inbox** — Candidate rows `userState='INBOX'` deduped, tier + trigger-tag chips, actions: +Watch / Archive (server actions); "killed by quality" log (tier-3 rows failing gates, collapsed `Disclosure`). Digest insights w/ provenance (reuse digest-data latest). Welcome-back banner when latest JobRun/digest is 10+ days old, offering a research run (link to launcher).
2. **`/portfolio`** — rebuild per IA: (a) held positions `DenseTable` (7 cols: symbol, entry, current, P&L, thesis-health, decay chips from `src/portfolio/decay.ts`, journal link); (b) watchlist valuation-band grid (5 cols, sorted by distance-to-buy-under × quality); (c) **monthly buy ceremony** — 4-step client wizard overlay (`web/app/portfolio/BuyCeremony.tsx`): step1 watchlist harvest (in-band names) → step2 governor sizing (`src/calibration/governor.ts` caps, `src/buylist/build.ts` allocation math via server action) → step3 inversion checklist → step4 printable order sheet (manual broker entry; **NO broker/order code — text only**). Wizard button surfaced only when due (no BuyList row for current month, and day-of-month ≤ 14 → "due" pill, else quiet link). Completing it writes BuyList/BuyListItem + JournalEntry + DecisionSnapshot.
3. **`/journal`** — rebuild: entry log (frozen `DecisionSnapshot` payload rendered for historical entries — NEVER live data), editor (create/edit), post-trade outcome cards (`src/calibration/outcomes.ts`), mistake taxonomy chips, quarterly review board (group by quarter), **calibration/governor console moved here** (reuse calibration-data reader + existing charts logic, restyled with primitives).

## Deletions (after the three pages compile)

4. Delete route dirs: screener, discovery, signals, memos, calibration, buylist, capture (drawer from P4 replaces it), story, live, digest, dossiers, and the tickers index `web/app/tickers/page.tsx` (sidebar search + watchlist replace it; keep `[symbol]`). Add `redirects()` in `web/next.config.ts` → old paths to their new homes (screener/discovery/signals→`/`, memos/dossiers→`/tickers`? No — dossiers/[id]→`/tickers` isn't resolvable: redirect plain paths only; dynamic old routes → `/`). Delete now-orphaned `web/lib/{demo,despike,screener-data,signals-data,discovery-data,memo-data,story-data,story-types,live}.ts`, `web/components/story/*`, `web/components/TickerPriceChart.tsx`, `web/app/story.css` if still present — **grep imports first; the build must stay green**. Keep all `src/` engine modules (screener/discovery/story engines stay).
5. Update every affected CLAUDE.md (`web/`, `web/app/`, `web/lib/`, `web/components/`) to describe the 5-route IA.

## Gates (fix until green)
`cd web && npm run build` · root `npm run typecheck` · `npm test` · `npm run check:claude`. Append `## Result` here. Do NOT commit. Touch only: web/** (per above), affected CLAUDE.md. Do NOT touch src/ engine modules.

## Result

Built all three pages, deleted the 12 retired routes, wired redirects, and updated
every affected CLAUDE.md. `src/` untouched (517 tests unchanged in count from
before this batch except for pre-existing growth from P1-P6; this batch added
zero engine tests since it's UI-only).

**`/` Action Center** (`web/app/page.tsx` + new `web/lib/dashboard-data.ts`):
welcome-back banner (10+ idle days since latest JobRun/Digest → one-click
`refreshDigestAction`), header micro-strip (portfolio value/P&L, this month's
buy-ceremony capital, per-tier governor status), `.dashboard-grid` panels —
Sourcing Inbox (`Candidate` `userState=INBOX` tier 1-2, `+Watch`/`Archive` via
new `web/components/SourcingInbox.tsx` client island + `watchCandidateAction`/
`archiveCandidateAction` in `app/actions.ts`; tier-3 rows collapsed into a
"killed by quality" `Disclosure`), Action Queue (watchlist buy-band proximity,
closest-to-trigger empty-state line), Tripwire/Decay Alerts (merges
`decaySignals` over held positions with recent `RuleEvent` fires) + Catalysts
(7d), Digest Insights, Calibration tier strip, Portfolio Snapshot.

**`/portfolio`** (`PortfolioClient.tsx` + `BuyCeremony.tsx` + new
`web/lib/buy-ceremony-data.ts`): held positions 7-col `DenseTable`
(symbol/entry/current/P&L/thesis-health badge/decay chips/journal link),
watchlist 5-col band grid (`loadWatchlistBandGrid()`, sorted by
distance-to-buy-under × `Candidate.tier`), and the 4-step buy-ceremony wizard —
harvest (BUY-verdict RecCalls × watchlist band) → sizing (LIVE
`governSize`/`buildBuyList` recompute via `previewBuyListAction`, never reused
from a stale call-time `governedSizePct`) → inversion (3 acknowledgements +
notes) → order sheet (plain monospace text, copy-to-clipboard, explicit
"MANUAL BROKER ENTRY ONLY" banner). `commitBuyCeremonyAction` transactionally
writes `BuyList`/`BuyListItem` + one `JournalEntry`/`DecisionSnapshot` per
non-skipped item. The wizard button is always present; a `DUE` badge appears
only when no `BuyList` row exists for the current month and day-of-month ≤14.

**`/journal`** (`page.tsx` + `JournalEditor.tsx` + `web/lib/journal-data.ts`
additions): quarterly review board (entries grouped `YYYY-Qn`, each showing its
frozen `DecisionSnapshot` payload — rendered as-is, never recomputed), mistake
taxonomy (mechanical `JournalEntry`×`RecCall.thesisFalsified` cross-reference
bucketed by action), a create-only editor (history is immutable — a correction
is a new entry), post-trade outcome cards (existing `RecCall.outcome1m/3m/6m/1y`
via `listRecCalls()`), and the calibration/governor console moved from the
deleted `/calibration` page (tier cap-status table + full recommendation log in
a `Disclosure`, restyled with `DenseTable`/`Badge` primitives; dossier links now
point at `/tickers/[symbol]#consensus`).

**Deletions**: route dirs `screener`, `discovery`, `signals`, `memos`,
`calibration`, `buylist`, `capture`, `story`, `live`, `digest`, `dossiers`, and
`tickers/page.tsx` (index). Orphaned `web/lib/*`: `demo.ts`, `despike.ts`
(retired — `ticker-data.ts`/`themes-data.ts` now import `despike` from
`@engine/lib/metrics`), `screener-data.ts`, `signals-data.ts`,
`discovery-data.ts`, `memo-data.ts`, `story-data.ts`, `story-types.ts`,
`live.ts`, and — found by grep, not in the original list —
`dossier-data.ts`/`dossier-types.ts` (only consumer was `app/dossiers/`).
Orphaned components: the `web/components/story/*.tsx` editorial components
(kept `story.css` — still imported by the kept `tickers/[symbol]/page.tsx`),
`TickerPriceChart.tsx`, and — also found by grep — `InsightList.tsx` and
`ScenarioEstimator.tsx` (dead once `/` was rewritten and `/story` removed).
`getRunStatusAction` (used app-wide by `components/run-ui.tsx`) moved from the
deleted `app/dossiers/actions.ts` into the surviving `app/actions.ts`.

**Deviation from the spec's redirect suggestion**: the spec's own text flags
`/memos`→`/tickers` and `/dossiers`→`/tickers` as "not resolvable" for the
dynamic child routes and hedges with a `?`. Since `tickers/page.tsx` (the
index) is itself deleted, `/tickers` has no page at all — redirecting there
would 404. `web/next.config.ts` sends `/memos`, `/dossiers`, and their dynamic
children, plus `/tickers` itself, to `/` instead. `/calibration`→`/journal` and
`/buylist`→`/portfolio` (live homes for that content); everything else → `/`.

**Verification beyond the gates**: booted `next start` against the real
`data/engine.db` and curled all 5 routes (200s), the 3 redirect targets
(307 → `/journal`, `/portfolio`, `/`), and confirmed every panel on a page
with no seeded `Candidate`/`WatchlistEntry`/`Position`/`JournalEntry` rows
renders its real `EmptyState` (no blank/broken panels) while Digest Insights
and the Calibration tier strip — which do have seeded data — render live rows.

## Gate output

- `cd web && npm run build` — green. 5 routes: `/` (ƒ), `/journal` (ƒ),
  `/portfolio` (ƒ), `/themes` + `/themes/[code]`, `/tickers/[symbol]` (ƒ).
- root `npm run typecheck` — clean, no errors.
- `npm test` — **82 test files, 517 tests, all passing** (unchanged by this
  batch — no `src/` files were touched).
- `npm run check:claude` — `✓ CLAUDE.md present in all 53 directories.`
