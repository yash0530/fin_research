import {
  StoryPageDataSchema,
  type Scenario,
  type StoryPageData,
} from "./schema";

// Deterministic story composer. The narrative (Qwen prose) is optional and layered
// separately; this module produces the frozen, provenance-bearing data the page
// renders from.

/**
 * The scenario estimator's core: impliedPrice = revenue × margin × P/E ÷ shares.
 * (Earnings = revenue × margin; price = earnings × P/E ÷ shares.) The React
 * ScenarioEstimator recomputes this client-side with the same formula.
 */
export function impliedPrice(s: Scenario): number {
  if (s.sharesOut <= 0) return 0;
  return (s.revenue * s.margin * s.pe) / s.sharesOut;
}

export type ScenarioPrices = { bear: number; base: number; bull: number };

export function scenarioPrices(data: StoryPageData): ScenarioPrices {
  return {
    bear: impliedPrice(data.scenarios.bear),
    base: impliedPrice(data.scenarios.base),
    bull: impliedPrice(data.scenarios.bull),
  };
}

/** Validate + freeze a story-page payload. Throws if the shape is invalid. */
export function buildStory(input: unknown): StoryPageData {
  return StoryPageDataSchema.parse(input);
}

/** Upside of the base-case implied price vs the price frozen at build time. */
export function baseUpsidePct(data: StoryPageData): number | null {
  if (data.priceAtBuild <= 0) return null;
  return ((impliedPrice(data.scenarios.base) - data.priceAtBuild) / data.priceAtBuild) * 100;
}
