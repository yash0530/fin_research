// Mirrored from root src/story/schema.ts — web/ must not import from root src/.
// These types match the Zod schemas in the engine; keep in sync manually.

export interface Stat {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down";
  evidenceRef?: string;
}

export interface Scenario {
  revenue: number;   // currency units (e.g. $B annualized)
  margin: number;    // net margin as a decimal (0.30 = 30%)
  pe: number;
  sharesOut: number; // billions
}

export interface StoryScenarios {
  bear: Scenario;
  base: Scenario;
  bull: Scenario;
}

export interface CycleStripBand {
  label: string;
  widthPct: number;
  color: string;   // CSS variable name, e.g. "var(--b1)"
}

export interface CycleStripData {
  stage: string;
  position: number; // 0..1
  bands: CycleStripBand[];
}

export interface ChartSeries {
  label: string;
  data: number[];
  color?: string;   // CSS color; omit for auto
  type?: "bar" | "line";
  dashed?: boolean;
}

export interface EvidenceChart {
  title: string;
  subtitle: string;
  labels: string[];
  series: ChartSeries[];
  fullWidth?: boolean;
  tall?: boolean;
  yUnit?: string;         // e.g. "%" — appended to axis labels
  showValueLabels?: boolean;
  valueLabelFmt?: string; // printf-like: "$" prefix, "x" suffix, etc.
}

export interface ScenarioPreset {
  label: string;
  scenario: Scenario;
}

export interface StoryPageData {
  symbol: string;
  title: string;
  asOf: string;          // YYYY-MM-DD, frozen at build
  priceAtBuild: number;
  hero: {
    kicker?: string;
    eyebrow?: string;
    thesis: string;
    lead?: string;
    verdict: "BUY" | "HOLD" | "TRIM" | "AVOID";
    conviction: "HIGH" | "MEDIUM" | "LOW";
  };
  statTape: Stat[];
  cycleStrip: CycleStripData;
  scenarios: StoryScenarios;
  presets?: ScenarioPreset[];
  charts?: EvidenceChart[];
  setupTitle?: string;
  setupBody?: string[];
  evidenceTitle?: string;
  evidenceBody?: string;
  callouts: string[];
  footnotes: string[];
}

// ---- helpers ----

/** impliedPrice = revenue × margin × P/E ÷ shares (matches engine formula) */
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

// ---- DEMO fixture ----

export function demoStory(): StoryPageData {
  return {
    symbol: "MU",
    title: "The cycle, the multiple, and the price.",
    asOf: "2026-06-27",
    priceAtBuild: 1132,
    hero: {
      kicker: "Micron Technology · NASDAQ: MU",
      eyebrow: "A memory supercycle, read three ways",
      thesis: "Every fundamental Micron reports is at an all-time extreme. Its forward earnings multiple is below its long-run average. That contradiction is the whole story of this stock.",
      lead: "Every fundamental Micron reports is at an all-time extreme. Its forward earnings multiple is *below* its long-run average. That contradiction is the whole story of this stock — and it's exactly what makes the price so hard to call.",
      verdict: "HOLD",
      conviction: "HIGH",
    },
    statTape: [
      { label: "Price (Fri close)", value: "$1,132", delta: "▼ 6.7% on Friday", deltaDirection: "down" },
      { label: "Forward P/E", value: "~9.8x", delta: "vs ~17x 5-yr avg" },
      { label: "Revenue (FQ3)", value: "$41.5B", delta: "▲ 346% YoY", deltaDirection: "up" },
      { label: "Gross margin", value: "~85%", delta: "from 39% a year ago", deltaDirection: "up" },
      { label: "52-week range", value: "$103 → $1,255", delta: "+870% in a year" },
    ],
    cycleStrip: {
      stage: "elevated-peak",
      position: 0.26,
      bands: [
        { label: "peak 4–8x", widthPct: 19, color: "var(--b1)" },
        { label: "elevated 8–12x", widthPct: 19, color: "var(--b2)" },
        { label: "mid-cycle 12–18x", widthPct: 28.6, color: "var(--b3)" },
        { label: "downturn 18–25x", widthPct: 33.4, color: "var(--b4)" },
      ],
    },
    scenarios: {
      bear: { revenue: 44, margin: 0.55, pe: 8, sharesOut: 1.15 },
      base: { revenue: 50, margin: 0.71, pe: 9.5, sharesOut: 1.15 },
      bull: { revenue: 50, margin: 0.72, pe: 13, sharesOut: 1.15 },
    },
    presets: [
      { label: "Cycle cools", scenario: { revenue: 44, margin: 0.55, pe: 8, sharesOut: 1.15 } },
      { label: "Guidance base", scenario: { revenue: 50, margin: 0.71, pe: 9.5, sharesOut: 1.15 } },
      { label: "Upcycle extends", scenario: { revenue: 50, margin: 0.72, pe: 13, sharesOut: 1.15 } },
    ],
    setupTitle: "Why it moved, and what's underneath",
    setupBody: [
      "Micron fell ~6.7% Friday despite blowout earnings — a sector-wide chip selloff plus a report that OpenAI may delay its IPO to 2027, which would push back the AI-infrastructure spending that drives memory demand. None of it was about the business.",
      "Underneath sits a genuine AI-driven memory shortage. Data centers are absorbing DRAM and NAND supply, prices have roughly doubled, and the squeeze is now reaching consumers — Apple raised Mac and iPad prices mid-cycle for the first time in years, blaming the same shortage that's powering Micron's ~85% gross margins. The debate isn't whether memory is tight; it's how long it lasts, and whether the market keeps treating Micron as a cyclical or re-rates it as a durable AI supplier.",
    ],
    evidenceTitle: "Extremes everywhere — and a compressed multiple",
    evidenceBody: "Annual figures are GAAP from Micron's SEC filings; FY26 is an estimate (three quarters actual or guided, one estimated). The FY23 columns are the reminder of what the downside of this cycle looks like.",
    charts: [
      {
        title: "Revenue",
        subtitle: "fiscal year, $ billions",
        labels: ["FY21", "FY22", "FY23", "FY24", "FY25", "FY26e"],
        series: [{ label: "Revenue", data: [27.7, 30.8, 15.5, 25.1, 37.4, 125], type: "bar" }],
        showValueLabels: true,
      },
      {
        title: "Earnings per share",
        subtitle: "GAAP diluted, $ / share",
        labels: ["FY21", "FY22", "FY23", "FY24", "FY25", "FY26e"],
        series: [{ label: "EPS", data: [5.14, 7.75, -5.34, 0.70, 7.59, 66], type: "bar" }],
        showValueLabels: true,
        valueLabelFmt: "$",
      },
      {
        title: "Margins",
        subtitle: "% of revenue · gross vs net",
        labels: ["FY21", "FY22", "FY23", "FY24", "FY25", "FY26e"],
        series: [
          { label: "Gross", data: [37.6, 45.2, -9.1, 22.4, 39.0, 85], type: "line", color: "var(--accent)" },
          { label: "Net", data: [21.2, 28.2, -37.5, 3.1, 22.8, 62], type: "line", color: "var(--warn)", dashed: true },
        ],
        yUnit: "%",
      },
      {
        title: "P/E — now vs history",
        subtitle: "multiple (x)",
        labels: ["Trailing now", "Forward now", "5-yr avg", "10-yr avg"],
        series: [{ label: "P/E", data: [25.5, 9.8, 17.1, 16.9], type: "bar" }],
        showValueLabels: true,
        valueLabelFmt: "x",
      },
      {
        title: "The ramp",
        subtitle: "quarterly revenue, $ billions · the AI-memory acceleration",
        labels: ["Q1 25", "Q2 25", "Q3 25", "Q4 25", "Q1 26", "Q2 26", "Q3 26", "Q4 26e"],
        series: [{ label: "Revenue", data: [8.71, 8.05, 9.3, 11.3, 13.6, 20, 41.5, 50], type: "bar" }],
        fullWidth: true,
        tall: true,
        showValueLabels: true,
      },
    ],
    callouts: [
      "To reach $1,500 from here: hold the base earnings assumption and the forward P/E would need to be ~12.5x — or hold 9.5x and annualized EPS would need to climb to ~$158 (vs ~$137 now).",
    ],
    footnotes: [
      "Annual figures are GAAP from Micron's SEC filings; the headline EPS (~$25) and ~85% margins Micron reports are non-GAAP, so they read higher than the GAAP series here. FY26 bars and the Q1 FY27 estimate are not final results.",
      "The estimator is a scenario sandbox, not a forecast — and a reminder that for a cyclical, earnings and the multiple move inversely, so cranking both to extremes describes a world that has never existed.",
      "Data as of Jun 26–27, 2026. This is not investment advice.",
    ],
  };
}
