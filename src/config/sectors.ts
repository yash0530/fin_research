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
