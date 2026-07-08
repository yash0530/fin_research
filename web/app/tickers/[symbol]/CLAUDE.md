# web/app/tickers/[symbol]/ — Ticker detail cockpit route

`page.tsx` renders the cockpit for a single ticker, including despiked price
charts, metrics, filings, news, and dossier history.

P8 additions:

- **WHAT KILLS IT?** quadrant renders `detail.activeTripwires` from the tested
  `@engine/monitor/tripwires` surfacing (rule scoping, always-critical 8-K 4.02,
  non-routine filing-diff events), each prefixed with its severity.
- **QUALITY?** quadrant shows an amber `Badge variant="warning"` data-quality
  chip when any screen module emitted warnings (`detail.screenWarnings`; the
  tooltip lists exactly which fields are missing).
- **10-K/Q Diff Monitor** panel (filings section) renders `FilingEvent` rows of
  kind `filing-diff` written by the `filing_diff` research run — severity badge
  (thesis-relevant→critical, notable→warning, routine→neutral), accession
  provenance, and the LLM summary snippet; EmptyState suggests launching a
  filing-diff run when none exist. The classified-8-K list above it excludes
  filing-diff rows to avoid double rendering.
