// Tripwire rule types. Faithful port of ResearchEngine/lib/rules/types.ts, adapted
// to this repo: rules are CONFIG DATA (see src/config/tripwires.ts), evaluated by
// pure functions over an injectable RuleContext so tests drive them with fixtures
// and never touch a DB, network, or clock.

export type RuleSeverity = "info" | "warn" | "critical";

/** A price bar: `d` is a YYYY-MM-DD string (never a Date). */
export type CloseRow = { d: string; close: number };

type RuleBase = {
  id: string;
  severity: RuleSeverity;
  cooloffDays: number;
  /** `{value}` is the only interpolation. */
  message: string;
};

export type DrawdownRule = RuleBase & {
  type: "drawdown";
  symbol: string;
  lookbackDays: number;
  /** Fires when drawdown-from-high ≤ this (e.g. -20). */
  pct: number;
};

export type ConsecutiveMonthlyRule = RuleBase & {
  type: "consecutive_monthly";
  series: string;
  n: number;
  direction: "down" | "up";
};

export type FlagEqualsRule = RuleBase & {
  type: "flag_equals";
  series: string;
  value: number;
  withinDays: number;
};

export type RatioChangeRule = RuleBase & {
  type: "ratio_change";
  a: string;
  b: string;
  lookbackDays: number;
  /** Fires when ratio change over the lookback ≤ this percent (e.g. -5). */
  pct: number;
};

export type CompoundRule = RuleBase & {
  type: "compound";
  allOf: string[];
  noneOf: string[];
  /** 'capex_raise' blocks the fire when ManualSeries(capex_flag, +1) exists within 35d. */
  requireNotRecent?: "capex_raise";
};

export type TripwireRule =
  | DrawdownRule
  | ConsecutiveMonthlyRule
  | FlagEqualsRule
  | RatioChangeRule
  | CompoundRule;

/** Data accessors the evaluators run against — injectable so tests use fixtures. */
export type RuleContext = {
  today: string; // YYYY-MM-DD
  getCloses(symbol: string, lastN: number): Promise<CloseRow[]>;
  /** Last n rows of a manual series, newest first. */
  getSeriesLast(series: string, n: number): Promise<{ d: string; value: number }[]>;
  seriesValueWithin(series: string, value: number, withinDays: number): Promise<boolean>;
};

export type Fired = {
  id: string;
  severity: RuleSeverity;
  message: string;
  value: number | string | null;
};
