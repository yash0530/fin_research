# web/app/themes/[code]/ — theme page

Server component (`force-dynamic`). Layout: `.themes-grid` — left rail
(subtheme tree with member sparklines + 72h catalyst feed + AI-only capex
scorecard slot, EmptyState until P8) and main ranked table.

- Ranked table: rank with honest ties (`#4 (Tied)`), ticker link, 3-segment
  breakdown bar (quality/valuation/momentum with provenance `title` tooltips),
  F-Score `ScoreChip`, valuation-corridor `BandBar` (when WatchlistEntry bands
  exist), `TierTag` + trigger-tag `Badge`s, amber data-note badges.
- "Why #N" `Disclosure` rows expose the per-factor provenance strings +
  missing/warning notes for the top 10.
- Insufficient-data silo renders as its own labeled table — never ranked last.
- Query params: `?sub=<subtheme>` scopes the ranking; `?compare=subA,subB`
  renders two subthemes side-by-side.
