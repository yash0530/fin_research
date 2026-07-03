// Controlled vocabularies for the paste-capture contract. Ported from
// ResearchApp/lib/enums.ts (the subset the parser normalizes against). The external
// model is told these are case-insensitive; the parser upper-cases and validates.

export const LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const SENTIMENTS = ["BULLISH", "NEUTRAL", "BEARISH", "MIXED"] as const;
export const CYCLE_STAGES = ["DORMANT", "EMERGING", "HEATING_UP", "CROWDED", "ROLLING_OVER"] as const;
export const VERDICT_STANCES = ["RESEARCH_NOW", "WATCH", "DEFER", "AVOID"] as const;

export type Level = (typeof LEVELS)[number];
export type Sentiment = (typeof SENTIMENTS)[number];
export type CycleStage = (typeof CYCLE_STAGES)[number];
export type VerdictStance = (typeof VERDICT_STANCES)[number];
