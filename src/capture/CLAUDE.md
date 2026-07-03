# src/capture/ — paste-capture web-research channel

The $0 research channel (Signal Desk port): render a prompt → user pastes it into
Perplexity/Claude/ChatGPT → paste the answer back → parse into typed evidence.

## Files

- `parse.ts` — `parseCapture(raw)`: strict JSON contract first (`{items:[{kind,ticker?,
  text,source?,confidence?,asOf?}]}`, salvaged by jsonsafe), then a **legacy line
  fallback** (`- [kind] text`, `$TICKER …`, `- bullet`). `parseStatus: json|legacy|empty`.
  Kinds: claim/risk/catalyst/target/verdict/theme_signal/watch/question/ticker_mention.
  Also the **full-contract parser** `parseResearchOutput(raw)` (port of ResearchApp's
  parser): the primary fenced-`json` block with 10 arrays → a typed `ParsedSignalBlock`,
  falling back to the legacy pipe-delimited `SIGNAL_DESK_DATA_*` block. `OUTPUT_FORMAT`
  is the full donor contract (10 arrays + enum vocab + 1–5 confidence + mandatory
  discoveries + shape example) appended to every rendered prompt.
- `enums.ts` — the controlled vocab the parser normalizes against (LEVELS, SENTIMENTS,
  CYCLE_STAGES, VERDICT_STANCES).
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
`research-output.test.ts` — ported donor cases: full fenced-`json` contract (all 10
arrays), legacy pipe block, malformed-line tolerance, and JSON type safety.
