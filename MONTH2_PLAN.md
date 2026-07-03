# MONTH 2 — Improve (owner mandate: "improve it in any way you see fit")

v1 proved the machine runs itself. Month 2 makes it *worth trusting*. Five themes,
ordered by expected impact on investment-decision quality per unit of effort.

## T1 — Calibration at scale (the ledger IS the product)
The 4-verdict ledger (0 BUYs) can't answer "is the judge good?". Target: **50+
dossiers by month end** across the AI-infra lens + S&P sector leaders, so tier
favorable-rates mean something when horizons land.
- `promptVersion` tagged on every RecCall (migration) — prompt iterations must never
  contaminate calibration slices. DO FIRST, before the campaign.
- Campaign seeder: keep the dossier queue stocked from a priority list (watchlist →
  AI-lens → GICS leaders); daemon drains ~1-3/day on llama time.
- Transcript quality reviews (CEO, weekly): systematic weaknesses — tools underused?
  bear over-weighted? evidence gaps? File prompt fixes as versioned changes.
- When 1m horizons start landing (~Aug): first real favorable-rate read; write it up.

## T2 — Fundamentals depth via EDGAR companyfacts (free, official XBRL)
Yahoo's ~7 quarters starves financial_trends/QoE/DCF. `data.sec.gov/api/xbrl/
companyfacts/CIK{cik}.json` gives YEARS of quarterly+annual facts for $0 under our
existing 8 req/s etiquette. New backfill (`edgar_facts`) → extend FundamentalsQuarter
(+ annual table if warranted, additive migration) → tools read the deeper series →
story-page revenue charts get real history. This is the single biggest research-
quality upgrade available for free.

## T3 — Close the living-memo loop (distillation was the point)
Memo deltas are staged but never applied — repeat dossiers can't build on prior
work. Build: apply/reject engine functions + `/memos/[symbol]` UI (staged-delta
review, versioned history) + re-dossier cadence (a symbol with an applied memo and
a >30d-old verdict re-queues; planner/judge already read memoSummary).

## T4 — Ops burn-down
- llama graceful-exit mystery (correlate the 3 incident timestamps against system
  logs; suspect sleep/power events).
- Watchdog direct-spawn fallback when launchd bootstrap errors (the error-5 state).
- `universe_check` job: constituent drift + deactivate delisted stragglers (the 5).
- Market-date is UTC-based; switch to America/New_York derivation (digest dating).
- Reboot survival remains owner-gated (TCC) — keep WELCOME_BACK current.

## T5 — Surface polish (agy lane, audited)
Discovery accept flow (second write path, CEO-specced) · Signals page (RuleEvent
history + ack) · Journal UI · screener drift-debt refactor (web → @engine) ·
story-page interactive pass in a real browser.

## Cadence & rules
Same constitution: exit-gated verify before every commit; every batch audited;
agy-only delegation (flash; opus if quota returns); CEO takes hard/subtle work;
honest TASKS.md evidence; weekly retro entries in EXEC_PLAN status log; WELCOME_BACK
updated as decisions accumulate. No broker code, ever.
