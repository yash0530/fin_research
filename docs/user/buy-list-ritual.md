# The Monthly Buy-List Ritual

Once a month you deploy $2,500. This is the routine that decides how, and — just as
important — learns from how those decisions turn out.

## The ritual (1st of the month)

1. **Draft.** ENGINE gathers every BUY verdict from the last ~45 days, ranks them by
   conviction (then confidence), sizes each one, and allocates your **$2,500**.
2. **Review & edit.** You can exclude anything, adjust, and see the governor's reasoning
   on each line.
3. **Finalize.** Lock the list.
4. **Log actual buys.** As you place trades in your own brokerage (ENGINE never touches
   it), record what you actually bought (amount, price, date). This also writes a journal
   entry.

## How sizing works

For each candidate, the planned dollars come from `min(judge size, governed size)`:

- **Judge size** — what the dossier's judge proposed (0–15%).
- **Governed size** — what the calibration governor allows for that conviction tier *right
  now* (see below).

The engine allocates those percentages across your $2,500, rounds each to a **$100
minimum lot**, and puts the **residual in cash**. If a position rounds below $100, it's
skipped (shown, not silently dropped).

### Worked example
Two proven-tier BUYs sized 12% and 8% of a $2,500 month → **$300** and **$200**, leaving
**$2,000** in cash. A LOW-conviction BUY capped to 2% → $50 → below the $100 lot → skipped.

## The calibration governor (why sizes start small)

This is the discipline that makes a local model trustworthy over time:

- **Conservative cap = 2%.** Until a conviction tier proves itself, every call in it is
  capped at 2% of capital.
- **Earning the lift:** a tier's cap lifts only after **≥5 resolved calls** with a
  **≥50% favorable** rate.
- **Favorable** is judged per action, using the 3-month outcome (or 1-month if that's all
  that's resolved): a BUY is favorable if it's up; a TRIM/AVOID if it's down; a HOLD if it
  stayed within ±2.5%.

So for the first few months, expect a conservative, near-evenly-capped list. That is the
system working as designed — it is refusing to bet big on an unproven track record. As
your resolved calls accumulate, tiers that demonstrate an edge get to size up.

## Outcomes & the track record

A weekly job fills in how past calls did, reading returns at the 1m/3m/6m/1y horizons
from your **local price history** (no network). The calibration view then shows the
favorable rate by conviction tier, by action, and **by model** — so if you later add a
second local model, you can see which brain is actually earning its size.

## What this ritual is *not*

It is not execution. ENGINE produces a plan; you decide and place the trades. There is no
broker integration and there never will be.
