# web/app/portfolio/ — Portfolio & monthly buy ceremony

`/portfolio` per the target IA: held positions, watchlist valuation bands, and the
4-step monthly buy-ceremony wizard.

## Files

- `page.tsx` — server loader: `loadPortfolio()` + `loadWatchlistBandGrid()` (both
  `@/lib/portfolio-data`), `getLatestBuyList()` (`@/lib/buylist-data`), and
  `loadHarvestCandidates()` + `ceremonyDue()` (`@/lib/buy-ceremony-data`) for the
  wizard's due-pill gating (no BuyList row this month AND day-of-month ≤ 14).
- `PortfolioClient.tsx` — client cockpit: `.portfolio-grid` layout —
  `.portfolio-held-cards` (7-col DenseTable: symbol, entry, current, P&L,
  thesis-health badge derived from decay-finding severity, decay-finding chips,
  journal link to `/journal?symbol=`), a latest-verdict detail panel on row
  select, the add/edit position form; `.portfolio-watchlist-grid` (5-col
  DenseTable sorted by distance-to-buy-under × tier); `.portfolio-governor-ctrl`
  (buy-ceremony trigger — always a link, a `DUE` `Badge` only when due).
- `PositionForm.tsx` — client add/edit form for `Position` rows (new design
  tokens only — no story.css).
- `BuyCeremony.tsx` — client 4-step wizard overlay: **1. Harvest** (recent
  BUY-verdict RecCalls decorated with watchlist buy-band distance, in-band names
  pre-checked) → **2. Sizing** (`previewBuyListAction` recomputes
  `src/calibration/governor.ts` caps LIVE against the current track record, then
  `src/buylist/build.ts` allocates the month's capital) → **3. Inversion**
  (3 Munger-style acknowledgements + a disconfirming-notes textarea, frozen into
  every `DecisionSnapshot`) → **4. Order sheet** (plain monospace text, copy-to-
  clipboard; **no broker/order code** — `commitBuyCeremonyAction` only writes
  `BuyList`/`BuyListItem` + one `JournalEntry` + one `DecisionSnapshot` per
  non-skipped item).
- `actions.ts` — `addOrUpdatePositionAction`/`removePositionAction` (unchanged
  `Position` CRUD via `@engine/db/queries`) + `previewBuyListAction` (step 2) +
  `commitBuyCeremonyAction` (step 4, transactional).

## Invariants

- No broker APIs, no order placement — the order sheet is text for manual entry.
- Governor sizing in step 2 is always recomputed live, never reused from a stale
  `RecCall.governedSizePct` — the whole point is judging against *today's* track
  record.
