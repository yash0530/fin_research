// Two taxonomies coexist, discriminated by `taxonomy`:
//   - "gics"     : base map, 11 sectors, every ticker gets exactly one.
//   - "ai_infra" : deep lens, 12 subsectors, multi-membership, richer signals.
// Lifecycle stages live per sector row and are ALWAYS human-gated.

export type Taxonomy = "gics" | "ai_infra";

export type Stage = "early" | "inflecting" | "popping" | "crowded" | "reset";
export const STAGES: readonly Stage[] = ["early", "inflecting", "popping", "crowded", "reset"];

export type SectorSeed = {
  code: string;
  name: string;
  taxonomy: Taxonomy;
  /** Driver id (0 = broad market). AI-infra sectors map to capex/compute drivers. */
  driver: number;
  /** RSS query for news; "" means no full-market news scan (noise). */
  newsQuery: string;
};

// GICS 11 — driver 0 "Broad market", newsQuery "" (full-market RSS is noise;
// news stays AI-lens + per-event).
export const GICS_SEEDS: SectorSeed[] = [
  { code: "g_energy", name: "Energy", taxonomy: "gics", driver: 0, newsQuery: "" },
  { code: "g_materials", name: "Materials", taxonomy: "gics", driver: 0, newsQuery: "" },
  { code: "g_industrials", name: "Industrials", taxonomy: "gics", driver: 0, newsQuery: "" },
  { code: "g_consumer_disc", name: "Consumer Discretionary", taxonomy: "gics", driver: 0, newsQuery: "" },
  { code: "g_consumer_staples", name: "Consumer Staples", taxonomy: "gics", driver: 0, newsQuery: "" },
  { code: "g_health_care", name: "Health Care", taxonomy: "gics", driver: 0, newsQuery: "" },
  { code: "g_financials", name: "Financials", taxonomy: "gics", driver: 0, newsQuery: "" },
  { code: "g_info_tech", name: "Information Technology", taxonomy: "gics", driver: 0, newsQuery: "" },
  { code: "g_comm_services", name: "Communication Services", taxonomy: "gics", driver: 0, newsQuery: "" },
  { code: "g_utilities", name: "Utilities", taxonomy: "gics", driver: 0, newsQuery: "" },
  { code: "g_real_estate", name: "Real Estate", taxonomy: "gics", driver: 0, newsQuery: "" },
];

// AI-infra 12 — the deep lens (drivers 1..5 = the capex → compute → power chain).
export const AI_INFRA_SEEDS: SectorSeed[] = [
  { code: "ai_compute_gpu", name: "Compute / GPU", taxonomy: "ai_infra", driver: 1, newsQuery: "Nvidia AI GPU datacenter" },
  { code: "ai_custom_silicon", name: "Custom Silicon / ASIC", taxonomy: "ai_infra", driver: 1, newsQuery: "AI accelerator ASIC TPU" },
  { code: "ai_memory", name: "Memory (HBM/DRAM/NAND)", taxonomy: "ai_infra", driver: 2, newsQuery: "HBM DRAM memory AI" },
  { code: "ai_networking", name: "Networking / Interconnect", taxonomy: "ai_infra", driver: 2, newsQuery: "AI networking optical interconnect" },
  { code: "ai_foundry", name: "Foundry / Equipment", taxonomy: "ai_infra", driver: 3, newsQuery: "TSMC foundry semiconductor equipment" },
  { code: "ai_hyperscaler", name: "Hyperscalers / Cloud", taxonomy: "ai_infra", driver: 3, newsQuery: "hyperscaler cloud capex" },
  { code: "ai_power", name: "Power / Cooling", taxonomy: "ai_infra", driver: 4, newsQuery: "datacenter power cooling grid" },
  { code: "ai_datacenter_reit", name: "Datacenter REITs", taxonomy: "ai_infra", driver: 4, newsQuery: "datacenter REIT colocation" },
  { code: "ai_models", name: "Frontier Models / Labs", taxonomy: "ai_infra", driver: 5, newsQuery: "frontier model training lab" },
  { code: "ai_software", name: "AI Software / Apps", taxonomy: "ai_infra", driver: 5, newsQuery: "AI software copilot enterprise" },
  { code: "ai_edge", name: "Edge / Devices", taxonomy: "ai_infra", driver: 5, newsQuery: "on-device AI edge inference" },
  { code: "ai_data", name: "Data / Storage", taxonomy: "ai_infra", driver: 2, newsQuery: "AI data storage vector database" },
];

/** GICS sector name (from CSV) -> code. Used by lib/universe.ts to map S&P rows. */
export const GICS_NAME_TO_CODE: Record<string, string> = {
  "Energy": "g_energy",
  "Materials": "g_materials",
  "Industrials": "g_industrials",
  "Consumer Discretionary": "g_consumer_disc",
  "Consumer Staples": "g_consumer_staples",
  "Health Care": "g_health_care",
  "Healthcare": "g_health_care",
  "Financials": "g_financials",
  "Financial Services": "g_financials",
  "Information Technology": "g_info_tech",
  "Technology": "g_info_tech",
  "Communication Services": "g_comm_services",
  "Communication": "g_comm_services",
  "Utilities": "g_utilities",
  "Real Estate": "g_real_estate",
};

export const ALL_SECTOR_SEEDS: SectorSeed[] = [...GICS_SEEDS, ...AI_INFRA_SEEDS];

// ── AI-infra ticker membership (donor port) ──────────────────────────────────
//
// Faithful port of the AI-infrastructure universe from the read-only donors
// `ResearchEngine/config/sectors.ts` (12-sector model, codes 00–11) and
// `ResearchApp/lib/taxonomy.ts` (14-theme model) — their union is ~131 tickers.
// Membership is mapped onto THIS repo's 12 `ai_*` codes (see AI_INFRA_SEEDS above),
// using the same semantics as `src/capture/theme-map.ts`. Tickers may belong to
// several `ai_*` sectors (genuinely distinct exposures only, e.g. AVGO sells AI
// silicon AND optical interconnect). Seeding is ADDITIVE and idempotent: an
// `ai_*` link is added on top of whatever GICS link a ticker already has.
//
// Donor-lens adaptations (this repo has a coarser 12-sector AI lens than the donors):
//   - Donor "Grid Equipment & Materials", "Cooling & Thermal" and "Data-Center Power
//     & Nuclear" all fold into `ai_power` (this repo has no separate grid/cooling code).
//   - Donor "AI Servers & Hardware" folds into `ai_data` (Data / Storage).
//   - Donor "Robotics & Physical AI" and "Drones & Defense" have no dedicated code
//     here; their members fold into `ai_edge` (driver-5 edge/devices/physical AI).
//   - `ai_models` and `ai_software` have no donor constituents (no public labs/app
//     names in the donor sets) and are intentionally left empty until curated.
export const AI_INFRA_TICKERS: Record<string, string[]> = {
  ai_compute_gpu: ["NVDA", "AMD", "AVGO", "MRVL", "INTC", "ARM", "TSM"],
  ai_custom_silicon: ["SNPS", "CDNS", "ARM", "ANSS", "AVGO", "MRVL"],
  ai_memory: ["MU", "SNDK", "WDC", "STX"],
  ai_networking: ["ANET", "CSCO", "CIEN", "COHR", "LITE", "FN", "ALAB", "CRDO", "GLW", "APH", "TEL", "AVGO", "MRVL"],
  ai_foundry: ["TSM", "ASML", "AMAT", "LRCX", "KLAC", "ONTO", "ACLS", "TER", "AMKR", "MKSI", "COHU", "CAMT", "FORM", "ICHR", "UCTT"],
  ai_hyperscaler: ["MSFT", "AMZN", "GOOGL", "META", "ORCL"],
  ai_power: [
    "CEG", "VST", "TLN", "NEE", "SO", "NRG", "BE", "GEV", "OKLO", "SMR",
    "ETN", "HUBB", "PWR", "NVT", "EMR", "GNRC", "FLNC",
    "FCX", "SCCO", "TECK", "BDC", "WCC", "NUE", "STLD",
    "VRT", "TT", "CARR", "JCI", "DOV", "MOD", "AAON", "XYL", "WTS",
  ],
  ai_datacenter_reit: ["EQIX", "DLR", "IRM", "AMT", "CCI", "SBAC", "DBRG", "GDS", "NBIS", "CORZ", "IREN", "CIFR", "WULF", "APLD", "CRWV"],
  ai_models: [],
  ai_software: [],
  ai_edge: [
    "QCOM", "NXPI", "TXN", "ADI", "MPWR", "MCHP", "ON", "STM",
    "ROK", "ISRG", "HON", "ZBRA", "CGNX", "SYM", "TSLA", "SERV", "ABBNY", "TER",
    "AVAV", "KTOS", "RCAT", "RTX", "LMT", "NOC", "GD", "BA", "ACHR", "JOBY", "EH",
  ],
  ai_data: ["DELL", "HPE", "SMCI", "NTAP", "PSTG", "CLS", "FLEX", "JBL", "SANM", "MPWR"],
};

// Credit-proxy benchmarks that belong to NO sector (they feed the credit tripwire /
// synthesis, never a sector average). Seeded as bare tickers so prices can be pulled.
export const CREDIT_BENCHMARKS: { symbol: string; name: string }[] = [
  { symbol: "HYG", name: "iShares High Yield Corporate Bond ETF" },
  { symbol: "IEF", name: "iShares 7-10 Year Treasury Bond ETF" },
];

/** Flatten AI_INFRA_TICKERS into deduped {symbol, code} membership links. */
export function aiInfraLinks(): { symbol: string; code: string }[] {
  const seen = new Set<string>();
  const out: { symbol: string; code: string }[] = [];
  for (const [code, symbols] of Object.entries(AI_INFRA_TICKERS)) {
    for (const raw of symbols) {
      const symbol = raw.trim().toUpperCase();
      const key = `${symbol}\u0000${code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ symbol, code });
    }
  }
  return out;
}

/** Every distinct AI-infra symbol (deduped, sorted). */
export const AI_INFRA_SYMBOLS: string[] = Array.from(
  new Set(Object.values(AI_INFRA_TICKERS).flat().map((s) => s.trim().toUpperCase())),
).sort();
