# agy batch — Docs refresh for month-2 features (docs/ + WELCOME_BACK.md)

Month 2 added features the docs don't mention. Update the docs from this verified
fact sheet ONLY (no invented commands). Honest voice, matching existing docs.

## New/changed since the docs were written
- **EDGAR XBRL fundamentals**: `npm run job -- edgar_facts` backfills YEARS of quarterly
  fundamentals from data.sec.gov companyfacts (FundamentalsQuarter grew 3.4k→35k rows,
  ~64-82 quarters/symbol back to 2006-2008 vs Yahoo's ~7). Runs after edgar_index (needs
  Ticker.cik). Free, 8 req/s etiquette. INSERT OR IGNORE — never clobbers Yahoo quarters.
- **Living Memos** (`/memos`, `/memos/[symbol]`): every dossier stages a memo delta
  (10 sections). You Apply or Reject staged deltas in the UI (human-gated). Applied
  memos carry forward into future dossiers (compounding knowledge). This is
  distillation-over-RAG — the memo is the per-ticker knowledge store.
- **Calibration campaign**: `npm run job -- campaign` (and the daemon's idle-drain)
  keeps the dossier queue stocked (watchlist → AI lens → GICS leaders, backlog-capped)
  so the RecCall ledger grows toward statistical significance. Every RecCall is tagged
  `promptVersion` so prompt changes never contaminate calibration slices.
- **Outcomes loop**: `npm run job -- outcomes` (also in the overnight chain) fills
  RecCall 1m/3m/6m/1y horizons from local closes; `/calibration` shows earned-trust
  progress per conviction tier.
- **New web pages**: `/signals` (RuleEvent history), `/journal` (JournalEntry),
  `/discovery` (candidate queue), `/memos`. Screener now uses the real @engine screener.
- **Capture write path** (`/capture`): render → copy → paste → parse → commit
  (EvidenceItem/DiscoveryCandidate/Catalyst). This is the app's write surface for web
  research.

## Deliverables
- Update `docs/user/daily-workflow.md`: add memos review + campaign to the rhythm;
  list the new web pages.
- Update `docs/user/dossiers.md`: mention the staged-memo output + /memos review.
- Update `docs/user/getting-started.md`: add `edgar_facts` to the backfill sequence
  (after edgar_index), note the fundamentals depth.
- NEW `docs/user/calibration.md`: the campaign → ledger → outcomes → governor loop,
  and how to read /calibration (tiers, favorable rate, 2% cap until earned). Add it to
  docs/user/CLAUDE.md and any docs index.
- Update `WELCOME_BACK.md`: a new "## Month 2 additions" section summarizing the above
  (keep the existing month-1 content). Keep the 3 owner decisions current.
- Update root `README.md` LIVE-status bullets to include fundamentals depth + memos +
  calibration campaign.

## Rules
docs/ + WELCOME_BACK.md + README.md ONLY (+ ## Result here). No code. No invented
commands — every command must be one from the fact sheet. Sequential writes, no
subagents. Gate: `npm run check:claude` stays green. Do NOT commit.

## Result
I have fully updated the user documentation, WELCOME_BACK.md, and root README.md to reflect the Month 2 features:
1. **`docs/user/getting-started.md`**: Added `edgar_facts` to the backfill sequence (resumable job to backfill SEC companyfacts data) immediately following the `edgar_index` step, and detailed the difference in fundamentals depth (~64-82 quarters/symbol back to 2006-2008 vs Yahoo's ~7).
2. **`docs/user/daily-workflow.md`**: Listed all new web page routes (`/signals`, `/journal`, `/discovery`, `/memos`, `/calibration`) and the updated capture/screener routes. Added the Living Memos review flow and the Calibration Campaign auto-queue daemon to the daily rhythm.
3. **`docs/user/dossiers.md`**: Updated Step 8 (Memo Stage) of the debate pipeline to detail the 10-section Living Memo delta generation, human-gated Apply/Reject UI flow, and the "distillation-over-RAG" compounding knowledge store.
4. **`docs/user/calibration.md`** (New File): Created this new guide to detail the campaign -> ledger -> outcomes -> governor loop, explain the 2% conservative sizing cap on unproven tiers, detail the rules/favorable rates required to lift the cap, and describe how to read the `/calibration` page.
5. **`docs/user/CLAUDE.md`** & **`docs/CLAUDE.md`**: Registered the new `calibration.md` file in both indexes.
6. **`WELCOME_BACK.md`**: Appended a new "## Month 2 additions" section summarizing the new features, while keeping all existing Month 1 content and the 3 owner decisions intact.
7. **`README.md`**: Updated the LIVE Status bullets to reflect the SEC EDGAR XBRL companyfacts database size/depth, Living Memos, and the Calibration Campaign/outcomes loop. Added `edgar_facts` to the Quickstart backfill commands list.

Verified via `npm run check:claude` that all CLAUDE.md invariants remain satisfied and green. No code was modified and no changes were committed.
