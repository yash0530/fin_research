# Backtest findings — do the deterministic signals have edge? (Jul 2026)

Ran the leak-free signal backtest over **107 monthly as-of points, 2010-2025**, scoring
each signal family's forward returns vs the equal-weight eligible-universe baseline
(price ≥ $5). Excess = flagged mean − baseline mean.

| Family | 21d | 63d | 126d | 252d | 252d hit-rate |
|---|---|---|---|---|---|
| movers_up (chase winners) | **−0.35%** | +0.78% | +1.61% | +9.24% | 46.7% |
| movers_down (buy losers) | +2.23% | +4.37% | +7.34% | +10.46% | 53.2% |
| drawdown (−25% off high) | +0.53% | +2.78% | +5.08% | +10.45% | 53.3% |

## The honest read (do NOT take the +10% at face value)

**The raw signals do not demonstrate robust, tradeable standalone edge.** Three reasons
the eye-catching long-horizon excess is mostly artifact, not skill:

1. **Hit-rates are ~coin-flip.** movers_up shows +9.24% mean excess at 252d but only
   **46.7%** of flagged names beat baseline — i.e. the *median* flagged name LOSES to
   baseline; the positive mean is dragged up by a few moonshots. A signal you can't win
   with more than half the time is not an edge, it's a lottery-ticket distribution.
2. **All three families converge on ~+10% at 252d — and they're mutually contradictory
   strategies** (chase strength / buy weakness / buy the fallen). They can't all have
   alpha. What they SHARE is selecting **high-volatility names**, which simply returned
   more in absolute terms over a 15-year bull market. The "excess" is a volatility
   premium, amplified by **survivorship bias** (the universe is today's survivors; the
   high-vol names that blew up and delisted aren't in the data).
3. **Transaction costs** would erode the small real effects further.

## What IS real (weak but statistically distinguishable)

- **Short-term reversal.** movers_up at 21d is NEGATIVE (−0.35% — chasing recent winners
  hurts short-term) while movers_down at 21d is the strongest short-horizon signal
  (+2.23%). That's the well-documented 1-month reversal, and it shows up cleanly.
- **Drawdown mean-reversion.** At n=8400, a 53.3% hit-rate at 252d is ~6 standard errors
  above 50% — a small but statistically real tilt: 25%-off-high names beat baseline more
  often than not over a year. Weak, hard to harvest after costs, but not noise.
- **Momentum (movers_up) shows NO edge** — actually mildly anti-predictive short-term.

## Strategic implication (this VALIDATES the architecture)

The deterministic signal families were never meant to be a trading strategy — this
backtest confirms they shouldn't be traded mechanically. Their job is to be the
**morning-briefing lens**: direct attention, provide context, and seed the multi-agent
dossiers. The platform's edge (if any) must come from the **research synthesis + human
judgment + earned calibration** the governor gates — NOT from following raw signals.

Practical consequences:
- Read the digest's movers/drawdown families as "look here", never "buy this".
- The calibration ledger (real dossier verdicts → outcomes) remains the true test of
  whether the *research* adds value; the raw signals demonstrably don't.
- Don't build a signal-following auto-strategy. (We never intended to; this is the
  evidence for why that instinct was right.)

Method notes: leak-free (signal extraction reads only `d ≤ asOf`, verified by test;
forward returns legitimately look forward to measure outcomes). Baseline = equal-weight
eligible universe. Caveat: survivorship bias inflates all absolute levels — the
flagged-vs-baseline EXCESS is the only meaningful comparison, and even it carries a
volatility tilt. Re-runnable: `npm run job -- backtest` → `data/backtests/*.json`.
