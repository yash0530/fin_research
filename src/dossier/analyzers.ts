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

// The promptPrefix strings port the sector KPI checklists from
// finance/analysis/analyzers/*.py (each analyzer's prompt_prefix + kpi_template
// good-ranges). requiredTools map the donor's required_tools to the tool names
// that exist in THIS repo's registry — no live transcripts/alt-data; filing- and
// catalyst-derived KPIs lean on our 8-K fallback (catalysts/news_tape).
export const ANALYZERS: Record<string, SectorAnalyzer> = {
  semis: {
    key: "semis",
    label: "Semiconductors / Hardware",
    requiredTools: ["fundamentals", "financial_trends", "qoe", "technicals", "sector_heat", "options_metrics"],
    promptPrefix:
      "When analyzing semiconductors, identify where the company sits in the capex/inventory " +
      "cycle, the customer-concentration risk (especially hyperscaler dependency), wafer " +
      "pricing and lead-time trends, and gross-margin trajectory. Watch for inventory-days " +
      "expansion as the early warning of a cycle top. Customer-concentrated names get a " +
      "multiple haircut even when current earnings look strong.\n" +
      "Key KPIs: gross margin (>50%, fabless leaders >70%); inventory days (60-90; above = " +
      "channel-stuffing risk); customer concentration (<30% top-1, <60% top-5); wafer/ASP " +
      "pricing (stable-to-up in an upturn); capex-cycle position (early-mid expansion " +
      "preferred); lead times (extending = strong demand, collapsing = warning).",
  },
  saas: {
    key: "saas",
    label: "Software / SaaS",
    requiredTools: ["fundamentals", "financial_trends", "qoe"],
    promptPrefix:
      "When analyzing a SaaS / cloud-software company, prioritize ARR growth trajectory, Net " +
      "Revenue Retention, Rule of 40 (growth + FCF margin), CAC payback, and magic number. " +
      "Treat decelerating NRR or expanding CAC payback as leading indicators of weakness even " +
      "if headline revenue still grows. Discount the multiple for a falling Rule of 40.\n" +
      "Key KPIs: ARR growth (>25% YoY at scale); NRR (>120% best-in-class, >110% healthy); " +
      "Rule of 40 (>40 = durable growth-with-margin); magic number (>1.0 productive S&M, " +
      ">1.5 excellent); CAC payback (<18 months healthy, <12 best-in-class); gross retention " +
      "(>90% enterprise, >85% SMB).",
  },
  banks: {
    key: "banks",
    label: "Banks / Financials",
    requiredTools: ["fundamentals", "financial_trends", "qoe", "macro"],
    promptPrefix:
      "When analyzing a bank, prioritize Net Interest Margin trajectory, deposit beta vs the " +
      "rate cycle, efficiency ratio (operating leverage), NPL trends (credit quality), Tier 1 " +
      "capital (capital-return capacity), and ROTCE (profitability per capital dollar). Always " +
      "frame the thesis against the rate regime and credit cycle — the same bank behaves very " +
      "differently in different macro states. Altman Z is not meaningful for banks.\n" +
      "Key KPIs: NIM (>2.8% US large-cap baseline); efficiency ratio (<60% best-in-class, " +
      "<65% acceptable); NPL ratio (<1% benign credit); deposit beta (<40% sticky franchise); " +
      "Tier 1 / CET1 (>11% above SCB requirement); ROTCE (>15% best-in-class).",
  },
  biotech: {
    key: "biotech",
    label: "Biotech / Pharma",
    requiredTools: ["fundamentals", "catalysts", "news_tape"],
    promptPrefix:
      "When analyzing biotech, anchor the thesis to (a) pipeline NPV — phase, indication size, " +
      "probability of approval — and (b) cash runway against the next catalyst. PDUFA dates, " +
      "Phase 2/3 readouts, and label expansions drive most of the moves. Pre-revenue names " +
      "should be sized as binary bets — never assume linear price action. Always check " +
      "dilution risk.\n" +
      "Key KPIs: pipeline phase mix (multiple Ph2/Ph3 assets across indications); PDUFA dates " +
      "(near-term catalyst within 12 months); cash runway (>8 quarters to avoid dilution " +
      "overhang); trial readouts (major readout within 6-9 months); patent-cliff years (>7 " +
      "years de-risked); R&D intensity (>15% commercial-stage; pre-revenue n/a).",
  },
  energy: {
    key: "energy",
    label: "Energy",
    requiredTools: ["fundamentals", "macro", "sector_heat"],
    promptPrefix:
      "When analyzing energy, frame the thesis against the oil/gas commodity curve and USD " +
      "regime first, then layer in company-specific reserves, wellhead breakeven, production " +
      "growth, F&D costs, and hedge book. Capital discipline (buybacks > production growth) is " +
      "the post-2020 norm — penalize companies that overspend on capex. The mid-cycle balance " +
      "sheet matters more than current cash flow.\n" +
      "Key KPIs: proved reserves (10+ years of production); wellhead breakeven (<$40/bbl " +
      "durable); production growth (mid-single-digits with discipline); F&D cost (<$10/BOE " +
      "Tier-1 acreage); hedging (30-60% of next-12-months production); net debt/EBITDA (<1.5x " +
      "at mid-cycle).",
  },
  reits: {
    key: "reits",
    label: "REITs / Real Estate",
    requiredTools: ["fundamentals", "financial_trends", "macro"],
    promptPrefix:
      "When analyzing a REIT, ignore GAAP earnings and focus on FFO/AFFO trajectory, AFFO " +
      "payout coverage, same-store occupancy, weighted average lease term (WALT), and the " +
      "cap-rate-vs-Treasury spread. REIT prices move with the 10Y yield — always anchor the " +
      "thesis to the rate regime and refinancing wall. A REIT can look cheap on P/E but " +
      "expensive on AFFO yield in a rising-rate world.\n" +
      "Key KPIs: FFO (>5% YoY same-store growth); AFFO payout ratio (<85% for safety); " +
      "occupancy (>95% Class A, >90% general); WALT (>7 years industrial/office, >5y retail); " +
      "cap-rate spread vs 10Y (>200bps attractive, <100bps rich); lease ladder (<15% of leases " +
      "expiring in any single year).",
  },
  consumer: {
    key: "consumer",
    label: "Consumer",
    requiredTools: ["fundamentals", "financial_trends", "sentiment", "peer_compare"],
    promptPrefix:
      "When analyzing a consumer or retail name, prioritize comp-store sales trajectory " +
      "(decomposed into traffic vs ticket), inventory turn, gross-margin spread vs the peer " +
      "cohort, and brand-strength sentiment signals. Watch for rising promotional intensity as " +
      "a leading indicator of margin pressure. Distinguish secular winners from cyclical " +
      "beneficiaries — both can show good current numbers but only one repeats next year.\n" +
      "Key KPIs: comp sales (positive low-single-digits mature, >5% strong); inventory turn " +
      "(>8x best-in-class); gross-margin spread (>200bps above cohort = pricing power); brand " +
      "strength (rising search/sentiment, top app rank); traffic vs ticket (traffic-led growth " +
      "is durable, price-led is fragile); promotional intensity (flat-to-down; rising = margin " +
      "pressure ahead).",
  },
  generic: {
    key: "generic",
    label: "Generic",
    requiredTools: ["fundamentals", "financial_trends", "technicals", "qoe", "peer_compare"],
    promptPrefix:
      "For this cross-sector company, focus on revenue-growth durability, operating-margin " +
      "trajectory, return on equity, and free-cash-flow conversion. Without a specialized " +
      "sector lens, lean harder on peer-compare and QoE forensics to triangulate quality.\n" +
      "Key KPIs: revenue growth (>10% growth, 5-10% steady, <0% concerning); operating margin " +
      "(>15% strong, >25% best-in-class); ROE (>15% strong); FCF margin (>10% cash-generative, " +
      ">20% excellent).",
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

/**
 * Free-text GICS sub-industry / industry → analyzer key. A backstop for the DB
 * router when a symbol carries an `industry` string (S&P universe data) but no
 * mapped sector code. Ordered most-specific-first; the first match wins.
 */
const INDUSTRY_KEYWORD_TO_ANALYZER: readonly [RegExp, string][] = [
  [/semiconduct|memory|dram|nand|hbm|foundry|wafer|chip|microchip/i, "semis"],
  [/software|saas|internet|cloud|application|platform|it services/i, "saas"],
  [/bank|thrift|mortgage finance|insurance|capital markets|financial|broker|asset management/i, "banks"],
  [/biotech|pharmaceutical|life science|health care equipment|drug|therapeutic/i, "biotech"],
  [/oil|gas|petroleum|coal|energy equipment|refining|drilling/i, "energy"],
  [/reit|real estate/i, "reits"],
  [/retail|consumer|apparel|restaurant|leisure|beverage|food|household|luxury|hotel|automobile/i, "consumer"],
];

/** The analyzer key a sector code routes to, or undefined if the code is unmapped. */
export function analyzerKeyForSectorCode(sectorCode: string | undefined): string | undefined {
  if (!sectorCode) return undefined;
  return SECTOR_CODE_TO_ANALYZER[sectorCode];
}

/** The analyzer key an industry/sub-industry string routes to, or undefined. */
export function analyzerKeyForIndustry(industry: string | undefined): string | undefined {
  if (!industry) return undefined;
  for (const [re, key] of INDUSTRY_KEYWORD_TO_ANALYZER) {
    if (re.test(industry)) return key;
  }
  return undefined;
}

/**
 * Pick the analyzer for a symbol. Deterministic and DB-free — the DB-aware
 * resolution (which sector code / industry to feed in) lives in
 * `src/dossier/job.ts` (that layer owns the SqlDb). Precedence: a mapped sector
 * code first (GICS or AI-lens), then an `industry` keyword backstop, else generic.
 */
export function classify(symbol: string, sectorCode?: string, industry?: string): SectorAnalyzer {
  const byCode = analyzerKeyForSectorCode(sectorCode);
  if (byCode) return ANALYZERS[byCode];
  const byIndustry = analyzerKeyForIndustry(industry);
  if (byIndustry) return ANALYZERS[byIndustry];
  return ANALYZERS.generic;
}
