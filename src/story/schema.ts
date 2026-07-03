import { z } from "zod";

// Frozen, archivable editorial "story page" data. The React components render
// from this; ScenarioEstimator recomputes impliedPrice client-side with the same
// formula. Data is a frozen snapshot so archived pages never drift.
//
// This is the SOURCE-OF-TRUTH shape; web/lib/story-types.ts is a hand-kept mirror
// (web/ must not import from root src/). The schema is a superset that the flagship
// dossier builder (src/story/from-dossier.ts) fills: hero prose, a stat tape, a
// cycle strip WITH bands, three scenarios, scenario presets, evidence charts, and
// honest footnotes. Everything beyond the deterministic core is optional so the
// page renders from a minimal payload and never crashes on a missing field.

export const StatSchema = z.object({
  label: z.string(),
  value: z.string(),
  delta: z.string().optional(),
  deltaDirection: z.enum(["up", "down"]).optional(),
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

export const CycleStripBandSchema = z.object({
  label: z.string(),
  widthPct: z.number(),
  color: z.string(), // CSS variable name, e.g. "var(--b1)"
});

export const CycleStripSchema = z.object({
  stage: z.string(),
  position: z.number().min(0).max(1),
  // Optional so a minimal payload validates; the web CycleStrip maps over it, so
  // the builder always emits a non-empty band set for a rendered page.
  bands: z.array(CycleStripBandSchema).default([]),
});

export const ChartSeriesSchema = z.object({
  label: z.string(),
  data: z.array(z.number()),
  color: z.string().optional(), // CSS color; omit for auto
  type: z.enum(["bar", "line"]).optional(),
  dashed: z.boolean().optional(),
});

export const EvidenceChartSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  labels: z.array(z.string()),
  series: z.array(ChartSeriesSchema),
  fullWidth: z.boolean().optional(),
  tall: z.boolean().optional(),
  yUnit: z.string().optional(), // e.g. "%" — appended to axis labels
  showValueLabels: z.boolean().optional(),
  valueLabelFmt: z.string().optional(), // printf-like: "$" prefix, "x" suffix, etc.
});

export const ScenarioPresetSchema = z.object({
  label: z.string(),
  scenario: ScenarioSchema,
});

export const StoryPageDataSchema = z.object({
  symbol: z.string(),
  title: z.string(),
  asOf: z.string(), // YYYY-MM-DD, frozen at build
  priceAtBuild: z.number(),
  hero: z.object({
    kicker: z.string().optional(),
    eyebrow: z.string().optional(),
    thesis: z.string(),
    lead: z.string().optional(),
    verdict: z.enum(["BUY", "HOLD", "TRIM", "AVOID"]),
    conviction: z.enum(["HIGH", "MEDIUM", "LOW"]),
  }),
  statTape: z.array(StatSchema).default([]),
  cycleStrip: CycleStripSchema,
  scenarios: StoryScenariosSchema,
  presets: z.array(ScenarioPresetSchema).optional(),
  charts: z.array(EvidenceChartSchema).optional(),
  setupTitle: z.string().optional(),
  setupBody: z.array(z.string()).optional(),
  evidenceTitle: z.string().optional(),
  evidenceBody: z.string().optional(),
  callouts: z.array(z.string()).default([]),
  footnotes: z.array(z.string()).default([]),
});

export type Stat = z.infer<typeof StatSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type CycleStripBand = z.infer<typeof CycleStripBandSchema>;
export type ChartSeries = z.infer<typeof ChartSeriesSchema>;
export type EvidenceChart = z.infer<typeof EvidenceChartSchema>;
export type ScenarioPreset = z.infer<typeof ScenarioPresetSchema>;
export type StoryPageData = z.infer<typeof StoryPageDataSchema>;
