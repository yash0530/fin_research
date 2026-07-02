import type { Claim, Verdict } from "./schemas";

// "No naked numbers." A claim survives only if it cites at least one ref that
// resolves to a real evidence source: a tool that returned OK (the ledger's
// citable namespace) or a `paste:{id}` reference from the capture channel.
// Port of finance/analysis/agents/evidence_validation.py.

function refIsValid(ref: string, citable: Set<string>): boolean {
  if (ref.startsWith("paste:")) return true;
  // A ref may be a bare tool name or `tool:...`; check the namespace head.
  const head = ref.split(":")[0];
  return citable.has(ref) || citable.has(head);
}

export function claimIsCited(claim: Claim, citable: string[]): boolean {
  const set = new Set(citable);
  return (claim.evidence_refs ?? []).some((r) => refIsValid(r, set));
}

/** Filter a claim list to only cited claims. */
export function dropUncited(claims: Claim[], citable: string[]): Claim[] {
  return claims.filter((c) => claimIsCited(c, citable));
}

export type ValidationReport = {
  droppedBull: number;
  droppedBear: number;
};

/** Strip uncited claims from a verdict's bull/bear cases; returns the cleaned
 *  verdict plus a count of what was dropped (for the audit trail). */
export function validateVerdict(
  verdict: Verdict,
  citable: string[],
): { verdict: Verdict; report: ValidationReport } {
  const bull = dropUncited(verdict.bull_case, citable);
  const bear = dropUncited(verdict.bear_case, citable);
  return {
    verdict: { ...verdict, bull_case: bull, bear_case: bear },
    report: {
      droppedBull: verdict.bull_case.length - bull.length,
      droppedBear: verdict.bear_case.length - bear.length,
    },
  };
}
