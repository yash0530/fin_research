import { describe, it, expect } from "vitest";
import { impliedPrice, scenarioPrices, buildStory, baseUpsidePct } from "./build";
import type { StoryPageData } from "./schema";

// Micron-style reference: revenue $30,000M, 30% net margin, 12x P/E, 1,100M shares.
// earnings = 9,000; ×12 = 108,000; ÷1,100 = $98.18.
describe("impliedPrice (scenario estimator math)", () => {
  it("matches the hand-built reference", () => {
    expect(impliedPrice({ revenue: 30000, margin: 0.3, pe: 12, sharesOut: 1100 })).toBeCloseTo(98.18, 2);
  });
  it("guards zero shares", () => {
    expect(impliedPrice({ revenue: 100, margin: 0.1, pe: 10, sharesOut: 0 })).toBe(0);
  });
});

const STORY: StoryPageData = {
  symbol: "MU",
  title: "Micron: the memory cycle turns",
  asOf: "2026-07-02",
  priceAtBuild: 90,
  hero: { thesis: "HBM demand outruns supply", verdict: "BUY", conviction: "MEDIUM" },
  statTape: [{ label: "Fwd P/E", value: "12x", evidenceRef: "fundamentals" }],
  cycleStrip: { stage: "inflecting", position: 0.4, bands: [] },
  scenarios: {
    bear: { revenue: 25000, margin: 0.2, pe: 8, sharesOut: 1100 },
    base: { revenue: 30000, margin: 0.3, pe: 12, sharesOut: 1100 },
    bull: { revenue: 36000, margin: 0.38, pe: 15, sharesOut: 1100 },
  },
  callouts: ["Thesis falsified if HBM ASPs roll over two quarters running"],
  footnotes: ["Data frozen at build; live quote shown separately"],
};

describe("story composer", () => {
  it("validates/freezes and computes monotonic scenario prices", () => {
    const data = buildStory(STORY);
    const p = scenarioPrices(data);
    expect(p.base).toBeCloseTo(98.18, 2);
    expect(p.bull).toBeGreaterThan(p.base);
    expect(p.base).toBeGreaterThan(p.bear);
  });

  it("computes base-case upside vs the frozen build price", () => {
    expect(baseUpsidePct(buildStory(STORY))).toBeCloseTo(((98.1818 - 90) / 90) * 100, 1);
  });

  it("rejects an invalid payload (position out of range)", () => {
    expect(() => buildStory({ ...STORY, cycleStrip: { stage: "x", position: 2 } })).toThrow();
  });
});
