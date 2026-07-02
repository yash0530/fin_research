// Sector analyzers as data objects + a deterministic classify() router. Replaces
// finance/analysis/sector_router.py. Classification is rule-based on the sector
// code (GICS or AI-lens) — no LLM call needed to pick the lens.

export type SectorAnalyzer = {
  key: string;
  label: string;
  /** Tools the planner should prioritise for this sector. */
  requiredTools: string[];
  /** Prepended to debate prompts to focus the lens. */
  promptPrefix: string;
};

export const ANALYZERS: Record<string, SectorAnalyzer> = {
  semis: {
    key: "semis",
    label: "Semiconductors / Hardware",
    requiredTools: ["fundamentals", "financial_trends", "qoe", "technicals", "sector_heat"],
    promptPrefix:
      "Analyze as a semiconductor/hardware name: watch the cycle (inventory, utilization, capex), gross-margin inflection, and demand concentration.",
  },
  saas: {
    key: "saas",
    label: "Software / SaaS",
    requiredTools: ["fundamentals", "financial_trends", "qoe"],
    promptPrefix:
      "Analyze as a software/SaaS name: net revenue retention, rule-of-40, FCF margin, SBC dilution, and durability of growth.",
  },
  banks: {
    key: "banks",
    label: "Banks / Financials",
    requiredTools: ["fundamentals", "financial_trends"],
    promptPrefix:
      "Analyze as a bank/financial: NIM, credit costs, capital ratios, and deposit stability. Altman Z is not meaningful here.",
  },
  biotech: {
    key: "biotech",
    label: "Biotech / Pharma",
    requiredTools: ["fundamentals", "catalysts", "news_tape"],
    promptPrefix:
      "Analyze as biotech/pharma: pipeline, cash runway vs burn, catalyst calendar (trials, PDUFA), and binary risk.",
  },
  energy: {
    key: "energy",
    label: "Energy",
    requiredTools: ["fundamentals", "macro", "sector_heat"],
    promptPrefix:
      "Analyze as energy: commodity price sensitivity, breakeven, capital discipline, and hedging.",
  },
  reits: {
    key: "reits",
    label: "REITs / Real Estate",
    requiredTools: ["fundamentals", "financial_trends"],
    promptPrefix:
      "Analyze as a REIT: FFO/AFFO (not EPS), occupancy, cap rates, debt maturities and rates. Use FFO-based valuation.",
  },
  consumer: {
    key: "consumer",
    label: "Consumer",
    requiredTools: ["fundamentals", "financial_trends", "sentiment"],
    promptPrefix:
      "Analyze as a consumer name: same-store/organic growth, margins, brand strength, and demand elasticity.",
  },
  generic: {
    key: "generic",
    label: "Generic",
    requiredTools: ["fundamentals", "financial_trends", "technicals"],
    promptPrefix: "Analyze with a general equity lens: growth, margins, balance sheet, valuation.",
  },
};

const SECTOR_CODE_TO_ANALYZER: Record<string, string> = {
  // AI-infra lens
  ai_compute_gpu: "semis",
  ai_custom_silicon: "semis",
  ai_memory: "semis",
  ai_foundry: "semis",
  ai_networking: "semis",
  ai_software: "saas",
  ai_models: "saas",
  ai_datacenter_reit: "reits",
  ai_power: "energy",
  ai_edge: "semis",
  ai_data: "saas",
  ai_hyperscaler: "saas",
  // GICS base map
  g_info_tech: "semis",
  g_financials: "banks",
  g_health_care: "biotech",
  g_energy: "energy",
  g_real_estate: "reits",
  g_consumer_disc: "consumer",
  g_consumer_staples: "consumer",
  g_comm_services: "saas",
};

/** Pick the analyzer for a symbol given an optional sector code. Deterministic. */
export function classify(symbol: string, sectorCode?: string): SectorAnalyzer {
  if (sectorCode && SECTOR_CODE_TO_ANALYZER[sectorCode]) {
    return ANALYZERS[SECTOR_CODE_TO_ANALYZER[sectorCode]];
  }
  return ANALYZERS.generic;
}
