import type { SynthInput } from "@engine/research/synthesize";
import type { TickerRow } from "@engine/screener/engine";
import type { Candidate } from "@engine/buylist/build";
import type { StoryPageData } from "@engine/story/schema";

// Fixture data. Pages pass these THROUGH the real, tested engine functions, so the
// UI proves the engine↔render integration compiles and renders deterministically.
// Live-data wiring (Prisma reads) is the remaining app-layer work in TASKS.md.

export const AS_OF = "2026-07-02";

export function demoSynthInput(): SynthInput {
  return {
    asOf: AS_OF,
    breadth: { pctAbove50dma: 28, advancers: 143, decliners: 357 },
    movers: [
      { symbol: "SMCI", retPct: 9.2 },
      { symbol: "MU", retPct: 4.1 },
      { symbol: "VRT", retPct: 3.3 },
      { symbol: "INTC", retPct: -7.8 },
      { symbol: "PLTR", retPct: -5.1 },
    ],
    gicsPulse: [
      { sectorCode: "g_info_tech", retPct: 1.8 },
      { sectorCode: "g_energy", retPct: -6.2 },
    ],
    aiPulse: [
      { sectorCode: "ai_memory", retPct: 3.4 },
      { sectorCode: "ai_power", retPct: -4.6 },
    ],
    divergences: [{ sectorCode: "ai_memory", sectorRetPct: -18, hyperscalerRetPct: 16 }],
    tripwires: [
      {
        id: "mem_exit",
        severity: "critical",
        message: "Memory-exit signal: contract pricing rolling over vs hyperscaler capex",
        evidence: "manual:capex_flag=-1; ai_memory 30d −18% vs hyperscaler +16%",
      },
    ],
  };
}

export function demoUniverse(): TickerRow[] {
  return [
    { symbol: "NVDA", gicsCode: "g_info_tech", aiCodes: ["ai_compute_gpu"], marketCap: 3200, forwardPE: 34, revenueGrowthPct: 62, watchlisted: true },
    { symbol: "MU", gicsCode: "g_info_tech", aiCodes: ["ai_memory"], marketCap: 130, forwardPE: 11, revenueGrowthPct: 58, watchlisted: true },
    { symbol: "AVGO", gicsCode: "g_info_tech", aiCodes: ["ai_custom_silicon"], marketCap: 780, forwardPE: 28, revenueGrowthPct: 22, watchlisted: true },
    { symbol: "VRT", gicsCode: "g_industrials", aiCodes: ["ai_power"], marketCap: 42, forwardPE: 33, revenueGrowthPct: 20, watchlisted: false },
    { symbol: "JPM", gicsCode: "g_financials", aiCodes: [], marketCap: 620, forwardPE: 12, revenueGrowthPct: 6 },
    { symbol: "XOM", gicsCode: "g_energy", aiCodes: [], marketCap: 480, forwardPE: 13, revenueGrowthPct: -3 },
  ];
}

export function demoCandidates(): Candidate[] {
  return [
    { symbol: "MU", dossierId: "dsr_MU", action: "BUY", conviction: "HIGH", confidence: 0.8, judgeSizePct: 12, governedSizePct: 12, governorReason: "", ageDays: 8 },
    { symbol: "AVGO", dossierId: "dsr_AVGO", action: "BUY", conviction: "MEDIUM", confidence: 0.6, judgeSizePct: 8, governedSizePct: 8, governorReason: "", ageDays: 20 },
    { symbol: "SMCI", dossierId: "dsr_SMCI", action: "BUY", conviction: "LOW", confidence: 0.4, judgeSizePct: 10, governedSizePct: 2, governorReason: "Only 1 resolved LOW call(s); capped to 2% until calibration is earned (5 needed).", ageDays: 3 },
  ];
}

export type DemoDossier = {
  id: string;
  symbol: string;
  status: "queued" | "running" | "done" | "failed";
  action?: "BUY" | "HOLD" | "TRIM" | "AVOID";
  conviction?: "HIGH" | "MEDIUM" | "LOW";
  summary?: string;
};

export const demoDossiers: DemoDossier[] = [
  { id: "dsr_MU", symbol: "MU", status: "done", action: "BUY", conviction: "HIGH", summary: "HBM demand outruns supply into 2027; cycle inflecting." },
  { id: "dsr_AVGO", symbol: "AVGO", status: "done", action: "BUY", conviction: "MEDIUM", summary: "Custom-silicon backlog strong; concentration risk noted." },
  { id: "dsr_INTC", symbol: "INTC", status: "running", summary: "Foundry economics under debate." },
  { id: "dsr_XOM", symbol: "XOM", status: "queued" },
];

export function demoStory(): StoryPageData {
  return {
    symbol: "MU",
    title: "Micron: the memory cycle turns",
    asOf: AS_OF,
    priceAtBuild: 90,
    hero: { thesis: "HBM demand outruns supply into 2027", verdict: "BUY", conviction: "HIGH" },
    statTape: [
      { label: "Fwd P/E", value: "11x", evidenceRef: "fundamentals" },
      { label: "Rev growth", value: "+58% YoY", evidenceRef: "financial_trends" },
      { label: "Altman Z", value: "4.4", evidenceRef: "qoe" },
    ],
    cycleStrip: { stage: "inflecting", position: 0.4, bands: [] },
    scenarios: {
      bear: { revenue: 25000, margin: 0.2, pe: 8, sharesOut: 1100 },
      base: { revenue: 30000, margin: 0.3, pe: 12, sharesOut: 1100 },
      bull: { revenue: 36000, margin: 0.38, pe: 15, sharesOut: 1100 },
    },
    callouts: ["Thesis falsified if HBM ASPs roll over two quarters running"],
    footnotes: ["Data frozen at build; live quote shown separately."],
  };
}
