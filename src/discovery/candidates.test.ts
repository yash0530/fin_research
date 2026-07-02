import { describe, it, expect } from "vitest";
import { observe, decide, type DiscoveryCandidate } from "./candidates";

describe("discovery candidates", () => {
  it("creates a new candidate on first observation", () => {
    const c = observe(undefined, "smci", "screener", 1000);
    expect(c).toMatchObject({ symbol: "SMCI", source: "screener", status: "new", occurrences: 1 });
    expect(c.firstSeen).toBe(1000);
  });

  it("bumps occurrences + lastSeen on re-observation", () => {
    const first = observe(undefined, "SMCI", "movers", 1000);
    const second = observe(first, "SMCI", "movers", 2000);
    expect(second.occurrences).toBe(2);
    expect(second.lastSeen).toBe(2000);
    expect(second.firstSeen).toBe(1000);
  });

  it("accepting promotes to a watchlisted discovery ticker", () => {
    const c: DiscoveryCandidate = { symbol: "SMCI", source: "screener", status: "new", occurrences: 3, firstSeen: 1, lastSeen: 9 };
    const r = decide(c, "accept");
    expect(r.candidate.status).toBe("accepted");
    expect(r.promote).toEqual({ symbol: "SMCI", source: "discovery", watchlisted: true });
  });

  it("rejecting/ignoring updates status but does not promote", () => {
    const c: DiscoveryCandidate = { symbol: "XYZ", source: "capture", status: "new", occurrences: 1, firstSeen: 1, lastSeen: 1 };
    expect(decide(c, "reject").promote).toBeNull();
    expect(decide(c, "reject").candidate.status).toBe("rejected");
    expect(decide(c, "ignore").candidate.status).toBe("ignored");
  });
});
