# web/app/discovery/ — the discovery queue

Read-only list of `DiscoveryCandidate` rows (symbol, source, occurrences, status,
first/last seen, note), newest-first. Writers today: paste-capture commits (unknown
tickers); movers/screener writers and an accept→watchlist flow are backlog (accepting
is CLI-only for now — the page says so honestly). Data via `web/lib/discovery-data.ts`
(missing-table guard).
