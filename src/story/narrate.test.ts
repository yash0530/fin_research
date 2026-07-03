import { describe, it, expect } from "vitest";
import { narrateStory } from "./narrate";
import { FakeProvider } from "../analyst/fake-provider";
import type { StoryPageData } from "./schema";

const STORY: StoryPageData = {
  symbol: "MU",
  title: "Micron: the memory cycle turns",
  asOf: "2026-07-02",
  priceAtBuild: 90,
  hero: { thesis: "HBM demand outruns supply", verdict: "BUY", conviction: "HIGH" },
  statTape: [{ label: "Fwd P/E", value: "11x" }],
  cycleStrip: { stage: "inflecting", position: 0.4, bands: [] },
  scenarios: {
    bear: { revenue: 25000, margin: 0.2, pe: 8, sharesOut: 1100 },
    base: { revenue: 30000, margin: 0.3, pe: 12, sharesOut: 1100 },
    bull: { revenue: 36000, margin: 0.38, pe: 15, sharesOut: 1100 },
  },
  callouts: ["Thesis falsified if HBM ASPs roll over"],
  footnotes: [],
};

describe("narrateStory", () => {
  it("parses narration prose and runs the narrator role with thinking OFF", async () => {
    const p = new FakeProvider(['{"hero_md":"Micron is inflecting.","sections":{"cycle":"Memory tightening."}}']);
    const n = await narrateStory(p, STORY);
    expect(n.hero_md).toContain("Micron");
    expect(n.sections.cycle).toBeTruthy();
    expect(p.calls[0].opts?.thinking).toBe(false); // narration → thinking off
  });

  it("retries on malformed prose then succeeds (harness reused)", async () => {
    const p = new FakeProvider(["not json", '{"hero_md":"ok","sections":{}}']);
    const n = await narrateStory(p, STORY);
    expect(n.hero_md).toBe("ok");
    expect(p.callCount).toBe(2);
  });
});
