/**
 * Mirrored Digest types (from src/research/synthesize.ts).
 * Web must NOT import from root src/; shapes are kept in sync manually.
 */

export interface DigestInsight {
  family: string;
  severity: "critical" | "warn" | "info";
  text: string;
  evidence: string;
}

export interface DigestJson {
  asOf: string;
  headline: string;
  insights: DigestInsight[];
  counts: Record<string, number>;
}

/** Hydrated Digest row — the DB row with parsed dataJson. */
export interface DigestRow {
  id: number;
  d: string;
  createdAt: string;
  headline: string;
  data: DigestJson;
  llmMd: string | null;
}

/** Thin listing metadata (no heavy JSON blob). */
export interface DigestMeta {
  id: number;
  d: string;
  headline: string;
}
