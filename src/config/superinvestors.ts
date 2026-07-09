export type Superinvestor = {
  cik: string;
  name: string;
  slug: string;
};

/**
 * Curated list of well-known superinvestors and value managers.
 * Each entry is documented with their investment style.
 */
export const SUPERINVESTORS: Superinvestor[] = [
  {
    // Warren Buffett's flagship conglomerate, focusing on long-term value, high-quality businesses with moats.
    cik: "0001067983",
    name: "Berkshire Hathaway Inc",
    slug: "berkshire",
  },
  {
    // Michael Burry's hedge fund, known for deep value, contrarian, and structured thematic plays.
    cik: "0001649339",
    name: "Scion Asset Management, LLC",
    slug: "scion",
  },
  {
    // David Tepper's fund, specializing in distressed debt, opportunistic equities, and macroeconomic inflection points.
    cik: "0001656456",
    name: "Appaloosa LP",
    slug: "appaloosa",
  },
  {
    // Stanley Druckenmiller's family office, legendary macro investor with high-conviction thematic equity holdings.
    cik: "0001536411",
    name: "Duquesne Family Office LLC",
    slug: "duquesne",
  },
  {
    // Bill Ackman's activist fund, running a highly concentrated portfolio of high-quality, large-cap companies.
    cik: "0001336528",
    name: "Pershing Square Capital Management, L.P.",
    slug: "pershing",
  },
  {
    // Seth Klarman's value-oriented hedge fund, known for margin-of-safety investing, cash holdings, and complex assets.
    cik: "0001061768",
    name: "Baupost Group LLC/MA",
    slug: "baupost",
  },
  {
    // David Einhorn's long/short value fund, focusing on intensive research and cataloging mispriced securities.
    cik: "0001079114",
    name: "Greenlight Capital Inc",
    slug: "greenlight",
  },
  {
    // Chase Coleman's growth-oriented fund, investing in late-stage tech, internet, and consumer sectors globally.
    cik: "0001167483",
    name: "Tiger Global Management LLC",
    slug: "tiger-global",
  },
  {
    // Chris Hohn's activist fund, running a concentrated global portfolio targeting structural efficiency and cash flows.
    cik: "0001647251",
    name: "TCI Fund Management Ltd",
    slug: "tci",
  },
];

/**
 * Normalizes a CIK to a 10-character zero-padded string.
 */
export function normalizeCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

/**
 * Lookup helper to find a superinvestor by CIK. Supports any format (padded or bare).
 */
export function getSuperinvestorByCik(cik: string): Superinvestor | undefined {
  const norm = normalizeCik(cik);
  return SUPERINVESTORS.find((s) => normalizeCik(s.cik) === norm);
}

/**
 * Lookup helper to find a superinvestor by slug.
 */
export function getSuperinvestorBySlug(slug: string): Superinvestor | undefined {
  const norm = slug.toLowerCase().trim();
  return SUPERINVESTORS.find((s) => s.slug === norm);
}
