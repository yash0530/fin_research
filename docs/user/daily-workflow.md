# The Daily Workflow

The whole point is that your morning takes five minutes. Open the dashboard, read the
digest, queue anything that deserves depth, get on with your day.

## When the digest is built

- **Laptop left on overnight:** a 6 AM job builds the digest; it's waiting when you wake.
- **Laptop was off/asleep:** open it and hit **Run morning**. The digest's *data* is
  computed immediately (it doesn't need the model); the written narrative fills in a
  moment later once the local model is reached.

Because accuracy beats speed here, it's fine if the narrative lands a little after the
numbers — the numbers are the substance.

## How to read the digest

The digest is a ranked list of **insights**, each with:

- a **severity** — `critical`, `warn`, or `info`;
- the **text** — what happened;
- the **evidence** — the provenance string showing the exact number or dated source
  behind it. If a line has no evidence, it isn't in the digest. Full stop.

It's organized into families:

| Family | What it tells you |
|---|---|
| **breadth** | How much of the market is participating (% above the 50-day average). Extremes are flagged. |
| **movers** | The day's biggest gainers and losers. |
| **GICS pulse** | The hottest and coldest broad sectors. |
| **AI-lens pulse** | The same, through the 12-subsector AI-infrastructure lens you care about. |
| **divergence** | When a sector pulls away from the hyperscaler capex that funds it — the key tell. A ≥30-point gap is `critical`. |
| **tripwire** | Pre-defined risk signals that fired. |

**Criticals are never truncated.** Even if the digest is capped for length, a critical
signal (a memory-cycle tripwire, an extreme divergence) always survives to the top.

## What to do with it

1. Skim the headline — it tells you if there are critical signals to review before
   deploying any capital.
2. Read the criticals and warns. Ignore nothing red.
3. For anything you want to *act* on, don't trust the one-liner — **queue a dossier**
   (see [Dossiers](dossiers.md)). The digest surfaces; the dossier decides.
4. New names you don't own show up in **discovery** — accept the ones worth watching and
   they join your watchlist.

## A healthy rhythm

- **Every morning:** read the digest, queue 0–2 dossiers.
- **During the day:** dossiers drain in the background (they never delay tomorrow's
  digest — the morning read always has priority on the single local model).
- **1st of the month:** the [buy-list ritual](buy-list-ritual.md).
- **Whenever you read something good on the web:** [capture](capture.md) it.
