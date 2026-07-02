// Institutional ownership (yahoo quoteSummary modules). Pure parser over the JSON.

export type Holder = { name: string; pctHeld: number | null; shares: number | null };
export type InstitutionalOwnership = { institutionsPct: number | null; topHolders: Holder[] };

const rawOrNull = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in (v as Record<string, unknown>)) {
    const r = (v as Record<string, unknown>).raw;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  return null;
};

type OwnershipJson = {
  majorHoldersBreakdown?: { institutionsPercentHeld?: unknown };
  institutionOwnership?: { ownershipList?: Array<{ organization?: string; pctHeld?: unknown; position?: unknown }> };
};

export function parseOwnership(json: OwnershipJson): InstitutionalOwnership {
  const institutionsPct = rawOrNull(json.majorHoldersBreakdown?.institutionsPercentHeld);
  const topHolders: Holder[] = (json.institutionOwnership?.ownershipList ?? []).map((h) => ({
    name: h.organization ?? "unknown",
    pctHeld: rawOrNull(h.pctHeld),
    shares: rawOrNull(h.position),
  }));
  return { institutionsPct, topHolders };
}
