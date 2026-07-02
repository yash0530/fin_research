import { z } from "zod";

// Frozen, archivable editorial "story page" data. The React components render
// from this; ScenarioEstimator recomputes impliedPrice client-side with the same
// formula. Data is a frozen snapshot so archived pages never drift.

export const StatSchema = z.object({
  label: z.string(),
  value: z.string(),
  evidenceRef: z.string().optional(),
});

export const ScenarioSchema = z.object({
  revenue: z.number(), // currency units (e.g. $M)
  margin: z.number(), // net margin as a decimal (0.30 = 30%)
  pe: z.number(),
  sharesOut: z.number(),
});

export const StoryScenariosSchema = z.object({
  bear: ScenarioSchema,
  base: ScenarioSchema,
  bull: ScenarioSchema,
});

export const StoryPageDataSchema = z.object({
  symbol: z.string(),
  title: z.string(),
  asOf: z.string(), // YYYY-MM-DD, frozen at build
  priceAtBuild: z.number(),
  hero: z.object({
    thesis: z.string(),
    verdict: z.enum(["BUY", "HOLD", "TRIM", "AVOID"]),
    conviction: z.enum(["HIGH", "MEDIUM", "LOW"]),
  }),
  statTape: z.array(StatSchema).default([]),
  cycleStrip: z.object({ stage: z.string(), position: z.number().min(0).max(1) }),
  scenarios: StoryScenariosSchema,
  callouts: z.array(z.string()).default([]),
  footnotes: z.array(z.string()).default([]),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type StoryPageData = z.infer<typeof StoryPageDataSchema>;
