# The Capture Channel

The **Capture Channel** allows you to leverage external, web-connected models (Perplexity, Claude, ChatGPT) for free (no API keys required) and bring their findings into ENGINE as typed evidence.

> [!IMPORTANT]
> **UI In-Progress Warning**: The web-based paste-capture interface is currently in-progress and under active development.

## The Capture Loop

1. **Render a Prompt** — Select one of the pre-defined templates. ENGINE builds a customized markdown prompt containing relevant local database context (e.g. your current watchlist, sector, or ticker).
2. **Paste & Run** — Copy the generated prompt and paste it into a web-connected model (e.g., Perplexity or Claude).
3. **Paste Back the Answer** — Copy the external model's response and paste it back into the ENGINE capture input. Because the prompt ends with a strict output contract, the external model will output clean JSON.
4. **Preview & Accept** — ENGINE parses the returned payload into typed elements. You can review and selectively check the items you want to keep.
5. **Commit** — Accepted items are persisted to the database and linked to the capture instance.

## Pre-defined Templates

- `daily_scan` — Material developments over the last 72 hours across tickers on your watchlist.
- `theme_deep_dive` — Supply/demand dynamics, key players, and value-chain positioning for a specific theme or sector.
- `ticker_check` — Key bulls, bears, and catalysts for a single ticker.
- `discovery_sweep` — Under-covered names *not* currently present on your watchlist.

## Parsed Output Kinds

The parser handles the following structured kinds:
- `claim` (general factual claims)
- `risk` (identified risk factors)
- `catalyst` (upcoming events or triggers)
- `target` (analyst price targets)
- `verdict` (overall analyst recommendations)
- `theme_signal` (broader theme indicators)
- `watch` (names to watchlist)
- `question` (unresolved points to research)
- `ticker_mention` (mentions of tracked or untracked symbols)

*Robust Parsing Fallback:* If the external model fails to follow the JSON contract and outputs raw prose, the parser automatically falls back to a legacy regex parser to extract `$TICKER` symbols and bulleted claims.

## Where Captured Evidence Goes

- **Dossier Citations**: Saved items become available to the dossier engine. When running a debate, the local model can cite these items as `paste:{id}` evidence, satisfying the "no naked numbers / every claim must cite" rule.
- **Discovery Queue**: Any newly identified tickers land in the discovery queue to be promoted to your watchlist.
- **Catalyst Calendar**: Dated events are added to your catalyst calendar.
- **Morning Digest**: Recent paste evidence (from the last ~72 hours) is included in the "external" family of your morning digest, annotated with `paste:{captureId}` provenance.
