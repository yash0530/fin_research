import { AI_INFRA_SEEDS } from "../config/sectors";

// Themes are CONFIG, not code: a theme is a named tree of subthemes, each mapping
// onto existing sector codes. v1 ships one theme (AI Infrastructure) whose 12
// subthemes are the `ai_*` sectors 1:1; adding a theme is adding an entry here.

export type Subtheme = {
  code: string;
  name: string;
  sectorCodes: string[];
};

export type Theme = {
  code: string;
  name: string;
  subthemes: Subtheme[];
};

export const THEMES: Theme[] = [
  {
    code: "ai",
    name: "AI Infrastructure",
    subthemes: AI_INFRA_SEEDS.map((s) => ({
      code: s.code,
      name: s.name,
      sectorCodes: [s.code],
    })),
  },
];

export function getTheme(code: string): Theme | undefined {
  return THEMES.find((t) => t.code === code);
}

export function getSubtheme(themeCode: string, subthemeCode: string): Subtheme | undefined {
  return getTheme(themeCode)?.subthemes.find((s) => s.code === subthemeCode);
}

/** Reverse lookup: which theme/subtheme (if any) covers a sector code. */
export function themeForSector(sectorCode: string): { theme: Theme; subtheme: Subtheme } | null {
  for (const theme of THEMES) {
    for (const subtheme of theme.subthemes) {
      if (subtheme.sectorCodes.includes(sectorCode)) return { theme, subtheme };
    }
  }
  return null;
}

/** All sector codes a theme spans (deduped, insertion order). */
export function themeSectorCodes(themeCode: string): string[] {
  const theme = getTheme(themeCode);
  if (!theme) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sub of theme.subthemes) {
    for (const code of sub.sectorCodes) {
      if (!seen.has(code)) {
        seen.add(code);
        out.push(code);
      }
    }
  }
  return out;
}
