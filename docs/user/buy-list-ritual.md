# The Monthly Buy-List Ritual

The **Buy-List Ritual** occurs on the 1st of each month to allocate a fixed **$2,500** of capital. It translates active BUY recommendations into a concrete investment plan, enforces sizing guardrails, and tracks outcomes to calibrate model sizing over time.

> [!IMPORTANT]
> **UI In-Progress Warning**: The web interface for `/buylist` and the automated memo apply flow are currently in-progress and under active development. You can review draft allocations in the UI, but actual trades must be placed manually in your own brokerage account.

## The Monthly Ritual Sequence (1st of the month)

1. **Draft** — ENGINE gathers all active `BUY` verdicts generated over the last **~45 days**, ranks them by conviction (then confidence), and sizes each name.
2. **Review & Edit** — You inspect the drafted allocation, view the governor's sizing constraints, and can manually exclude names or adjust amounts.
3. **Finalize** — Lock the monthly plan.
4. **Log Actual Buys** — After executing trades manually on your brokerage, record the actual purchased quantities, execution prices, and dates in ENGINE. This writes a corresponding journal entry to document your decision-making.

## Sizing Math & Rounding Rules

For each ticker, the allocated amount is:
$$\text{Allocated Dollars} = \$2,500 \times \min(\text{Judge Size}, \text{Governed Size})$$

- **Judge Size** — The raw position size suggested by the dossier's Judge (bounded between 0% and 15%).
- **Governed Size** — The size cap permitted by the calibration governor for the candidate's conviction tier (capped at 2% initially).

### Rounding to Lots
To prevent micro-positions, the engine applies these rules:
- All allocations are rounded to a **$100 minimum lot**.
- Any remaining unallocated amounts are swept into cash.
- If a governed allocation falls below $100, the position is **skipped** (it is displayed on the UI as skipped, not silently omitted).

### Worked Example
Suppose you have three BUY candidates in a $2,500 month:
- **Stock A** (Proven Tier, 12% size): $2,500 × 12% = $300 (allocates **$300**)
- **Stock B** (Proven Tier, 8% size): $2,500 × 8% = $200 (allocates **$200**)
- **Stock C** (Unproven Tier, capped at 2% governed size): $2,500 × 2% = $50 (falls below the $100 minimum lot → **skipped**)
- **Cash Residual**: $2,000 is kept in cash.

## The Calibration Governor

The calibration governor prevents the model from betting heavily on unproven strategies.

- **Initial Conservative Cap**: Every conviction tier (HIGH, MEDIUM, LOW) starts capped at **2%** of capital.
- **Earning a Cap Lift**: A conviction tier's cap will only be increased after achieving **≥5 resolved calls** with a **≥50% favorable** resolution rate.
- **Favorable Outcomes**:
  - **BUY**: Favorable if the stock is up at the resolution horizon.
  - **TRIM/AVOID**: Favorable if the stock is down at the resolution horizon.
  - **HOLD**: Favorable if the stock remains within a **±2.5%** range of its starting price.
  - Resolution is evaluated using the 3-month performance horizon (falling back to 1-month if only 1 month of data is resolved).

## Track Record & Outcomes

A weekly job runs to update the performance of past calls at 1-month, 3-month, 6-month, and 1-year horizons.
- **Data Source**: This job reads prices solely from your **local price history** (no network requests).
- **Attribution**: Outcomes are tracked by conviction tier, by action, and **by model profile**. If you configure multiple local models, you can compare their long-term track records to see which brain earns larger governed size caps.
