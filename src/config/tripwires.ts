// Tripwire rule definitions — CONFIG DATA, not logic. Severity ranks how prominently
// a fire is surfaced in the morning digest and the Signals view; cooloff suppresses
// re-fires. Faithful port of ResearchEngine/config/tripwires.ts. Edit freely; the
// pure evaluators in src/rules/engine.ts interpret these.

import type { TripwireRule } from "../rules/types";

export const TRIPWIRES: TripwireRule[] = [
  {
    id: "mu_drawdown_20",
    type: "drawdown",
    symbol: "MU",
    lookbackDays: 252,
    pct: -20,
    severity: "warn",
    cooloffDays: 7,
    message: "MU is {value}% off its 52-week high — re-read the memory-cycle kill risk.",
  },
  {
    id: "sndk_drawdown_25",
    type: "drawdown",
    symbol: "SNDK",
    lookbackDays: 252,
    pct: -25,
    severity: "warn",
    cooloffDays: 7,
    message: "SNDK is {value}% off its 52-week high.",
  },
  {
    id: "ddr5_two_down",
    type: "consecutive_monthly",
    series: "ddr5_contract_mom",
    n: 2,
    direction: "down",
    severity: "warn",
    cooloffDays: 25,
    message: "DDR5 contract prices down 2 consecutive months: {value}.",
  },
  {
    id: "capex_guide_cut",
    type: "flag_equals",
    series: "capex_flag",
    value: -1,
    withinDays: 35,
    severity: "critical",
    cooloffDays: 10,
    message: "Mag-7 capex guide-down flagged. Driver-1 (8 of 12 AI sectors) exposed.",
  },
  {
    id: "memory_exit",
    type: "compound",
    allOf: ["ddr5_two_down"],
    noneOf: [],
    requireNotRecent: "capex_raise",
    severity: "critical",
    cooloffDays: 30,
    message:
      "MEMORY EXIT SIGNAL: pricing rolling over with capex not rising. Historical pattern: 40-60% giveback within 6 months of peak. VERIFY AT SOURCE.",
  },
  {
    id: "credit_proxy",
    type: "ratio_change",
    a: "HYG",
    b: "IEF",
    lookbackDays: 30,
    pct: -5,
    severity: "warn",
    cooloffDays: 14,
    message:
      "HYG/IEF down {value}% in 30d — credit-stress PROXY for data-center financing. Verify ABS spreads at source.",
  },
];
