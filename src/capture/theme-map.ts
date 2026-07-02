// Signal Desk theme slugs → ENGINE Sector codes. Used when committing captured
// theme_signal items so they land on the right sector row.

export const THEME_TO_SECTOR: Record<string, string> = {
  gpu: "ai_compute_gpu",
  compute: "ai_compute_gpu",
  asic: "ai_custom_silicon",
  "custom-silicon": "ai_custom_silicon",
  memory: "ai_memory",
  hbm: "ai_memory",
  networking: "ai_networking",
  optical: "ai_networking",
  foundry: "ai_foundry",
  equipment: "ai_foundry",
  hyperscaler: "ai_hyperscaler",
  cloud: "ai_hyperscaler",
  power: "ai_power",
  cooling: "ai_power",
  datacenter: "ai_datacenter_reit",
  reit: "ai_datacenter_reit",
  models: "ai_models",
  labs: "ai_models",
  software: "ai_software",
  apps: "ai_software",
  edge: "ai_edge",
  data: "ai_data",
  storage: "ai_data",
};

/** Map a theme slug to a Sector code, or null if unknown (→ discovery). */
export function themeToSector(slug: string): string | null {
  return THEME_TO_SECTOR[slug.trim().toLowerCase()] ?? null;
}
