# src/portfolio/ — portfolio thesis-decay engine

- `decay.ts` — pure decay logic and helper functions:
  - `positionView(pos, currentPrice)`: maps a position and its current price to a complete `PositionView` containing costBasis, marketValue, and P&L % calculations.
  - `decaySignals({ symbol, currentPrice, avgCost, closes, recCall })`: evaluates the mechanical, machine-computable thesis-decay signals (stop_breach, drawdown, target_reached, below_cost) and returns an array of `DecayFinding` structures.
- `decay.test.ts` — unit tests for the pure decay functions covering stop_breach, drawdown, target_reached, and below_cost triggers.
