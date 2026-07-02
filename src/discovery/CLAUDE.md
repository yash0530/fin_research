# src/discovery/ — discovery candidate lifecycle

Pure logic for the discovery funnel. Writers (movers job, screener, capture, dossiers)
`observe()` symbols; the review queue `decide()`s them.

## candidates.ts

- `observe(existing, symbol, source, now)` — upsert: bump `occurrences` + `lastSeen` if
  seen before, else create as `new`. Symbol is uppercased.
- `decide(candidate, action)` — `accept | reject | ignore` → new status; **accept**
  returns a `promote` payload (`{symbol, source:"discovery", watchlisted:true}`) so the
  app layer turns it into a watchlisted Ticker. reject/ignore never promote.

Persistence (DiscoveryCandidate / Ticker rows) is the app layer; this module is the
decision logic, fully unit-tested.

## Tests

`candidates.test.ts` — create, re-observe (occurrences/lastSeen), accept→promote,
reject/ignore→no promote.
