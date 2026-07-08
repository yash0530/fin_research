// Symbol constants shared between `fixture-db.ts` (what gets seeded) and the
// spec files (what a test asserts against) — one source of truth so a spec
// never hardcodes a magic ticker string that could drift from the seed.

/** ai_* + g_* dual-linked, watchlisted, held, journal-logged — the "rich" name. */
export const PRIMARY_SYMBOL = "TSTA";
/** GICS-only (g_industrials), no watchlist/candidate rows — a plainer name. */
export const SECONDARY_SYMBOL = "TSTB";
/** GICS-only (g_info_tech), no watchlist/candidate rows. */
export const TERTIARY_SYMBOL = "TSTC";

export const SEEDED_SYMBOLS = [PRIMARY_SYMBOL, SECONDARY_SYMBOL, TERTIARY_SYMBOL] as const;

export const AI_SECTOR_CODE = "ai_compute_gpu";
export const GICS_SECTOR_CODE_PRIMARY = "g_info_tech";
export const GICS_SECTOR_CODE_SECONDARY = "g_industrials";

export const THEME_CODE = "ai";
