// Discovery candidate lifecycle (pure). Writers (movers job, screener, capture,
// dossiers) `observe()` symbols; the review queue `decide()`s them. Accepting a
// candidate promotes it to a watchlisted Ticker (source = discovery). Persistence
// (DiscoveryCandidate / Ticker rows) is the app layer; this is the logic.

export type CandidateStatus = "new" | "accepted" | "rejected" | "ignored";
export type CandidateSource = "movers" | "screener" | "capture" | "dossier";

export type DiscoveryCandidate = {
  symbol: string;
  source: CandidateSource;
  status: CandidateStatus;
  occurrences: number;
  firstSeen: number;
  lastSeen: number;
  note?: string;
};

/** Upsert: bump occurrences + lastSeen if seen before, else create as "new". */
export function observe(
  existing: DiscoveryCandidate | undefined,
  symbol: string,
  source: CandidateSource,
  now: number,
): DiscoveryCandidate {
  const sym = symbol.toUpperCase().trim();
  if (existing && existing.symbol === sym) {
    return { ...existing, occurrences: existing.occurrences + 1, lastSeen: now };
  }
  return { symbol: sym, source, status: "new", occurrences: 1, firstSeen: now, lastSeen: now };
}

export type Decision = "accept" | "reject" | "ignore";

export type TickerPromotion = { symbol: string; source: "discovery"; watchlisted: true };

export type DecisionResult = {
  candidate: DiscoveryCandidate;
  promote: TickerPromotion | null; // non-null only on accept
};

const NEXT_STATUS: Record<Decision, CandidateStatus> = {
  accept: "accepted",
  reject: "rejected",
  ignore: "ignored",
};

export function decide(candidate: DiscoveryCandidate, action: Decision): DecisionResult {
  const next = { ...candidate, status: NEXT_STATUS[action] };
  return {
    candidate: next,
    promote: action === "accept" ? { symbol: candidate.symbol, source: "discovery", watchlisted: true } : null,
  };
}
