# src/capture/ — paste-capture web-research channel

The $0 research channel (Signal Desk port): render a prompt → user pastes it into
Perplexity/Claude/ChatGPT → paste the answer back → parse into typed evidence.

## Files

- `parse.ts` — `parseCapture(raw)`: strict JSON contract first (`{items:[{kind,ticker?,
  text,source?,confidence?,asOf?}]}`, salvaged by jsonsafe), then a **legacy line
  fallback** (`- [kind] text`, `$TICKER …`, `- bullet`). `parseStatus: json|legacy|empty`.
  Kinds: claim/risk/catalyst/target/verdict/theme_signal/watch/question/ticker_mention.
  `OUTPUT_FORMAT` is the contract appended to every rendered prompt.
- `theme-map.ts` — `themeToSector(slug)`: Signal Desk theme slugs → ENGINE Sector codes
  (unknown → null → discovery).
- `render.ts` — `renderPrompt(template, ctx)` for 4 templates (daily_scan,
  theme_deep_dive, ticker_check, discovery_sweep) with local-data injection; always
  appends `OUTPUT_FORMAT` so the reply parses cleanly.

## Commit path (wired in the app layer)

Accepted items → `EvidenceItem` (origin=paste, citable as `paste:{id}`) +
`DiscoveryCandidate`s + dated `Catalyst`s; recent paste evidence feeds the digest's
external family and is citable in dossiers.

## Tests

`capture.test.ts` — JSON contract, prose/fence salvage, legacy fallback, empty,
theme mapping, prompt rendering + injected watchlist/ticker.
