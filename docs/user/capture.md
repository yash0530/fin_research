# The Capture Channel

The capture channel is your **free** web-research lane. Your local model is excellent for
reasoning over data you already have, but it doesn't browse the live web. When you want
current outside research, you borrow a web-connected model (Perplexity, Claude, ChatGPT)
by hand — no API keys, no cost — and fold the result back in as typed evidence.

## The loop

1. **Render a prompt.** Pick a template and ENGINE builds a prompt with your local context
   injected (your watchlist, a sector, or a ticker). Four templates:
   - **daily_scan** — material dated developments across your watchlist (last 72h).
   - **theme_deep_dive** — supply/demand and players for a theme/sector.
   - **ticker_check** — bull/bear/catalysts for one ticker.
   - **discovery_sweep** — under-covered names *not* already on your list.
2. **Paste it** into Perplexity/Claude/ChatGPT.
3. **Paste the answer back.** Every rendered prompt ends with a strict output contract, so
   the reply comes back as clean JSON.
4. **Preview & accept.** ENGINE parses the reply into typed items grouped by kind; you
   accept the ones worth keeping.
5. **Commit.** Accepted items become evidence in the system.

## What comes back

Each captured item has a **kind**: `claim`, `risk`, `catalyst`, `target`, `verdict`,
`theme_signal`, `watch`, `question`, or `ticker_mention`. The parser is forgiving — if the
external model ignores the JSON contract and just writes prose, a legacy fallback still
pulls out `$TICKER` mentions and bulleted claims.

## Where captured evidence goes

- **Evidence items** (origin = *paste*) become citable in future dossiers as
  `paste:{id}` — so a dossier can lean on your web research and it still passes the
  "every claim must cite" rule.
- **New tickers** you didn't already track land in the **discovery queue**.
- **Dated items** become **catalysts** on the calendar.
- Recent paste evidence (last ~72h) also feeds a dedicated "external" family in the
  morning digest, with `paste:{captureId}` provenance.

## Good habits

- Capture when you read something genuinely new, not to bulk-import noise.
- Prefer sources the external model can cite; the contract asks for sources and you can
  keep them on each item.
- Treat captured claims as *leads*, not verdicts — promote them by running a dossier.
