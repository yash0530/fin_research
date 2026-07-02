import { describe, it, expect } from "vitest";
import { sentimentScore } from "./sentiment";
import { mergeNewsTape, type NewsRow } from "./news-tape";

describe("sentimentScore", () => {
  it("is neutral (5) when there is no chatter at all", () => {
    const s = sentimentScore({ redditMentions: 0, redditPositiveRatio: 0, newsVolume: 0, rssCount: 0 });
    expect(s.score).toBe(5);
    expect(s.label).toBe("neutral");
  });

  it("is bullish on high volume + high positive ratio", () => {
    const s = sentimentScore({ redditMentions: 50, redditPositiveRatio: 0.9, newsVolume: 40, rssCount: 10 });
    expect(s.label).toBe("bullish");
    expect(s.score).toBeGreaterThan(6.5);
  });

  it("is bearish on low positive ratio + thin volume", () => {
    const s = sentimentScore({ redditMentions: 5, redditPositiveRatio: 0.1, newsVolume: 2, rssCount: 1 });
    expect(s.label).toBe("bearish");
    expect(s.score).toBeLessThanOrEqual(3.5);
  });

  it("always stays within 0..10", () => {
    const s = sentimentScore({ redditMentions: 1e6, redditPositiveRatio: 5, newsVolume: 1e6, rssCount: 1e6 });
    expect(s.score).toBeLessThanOrEqual(10);
    expect(s.score).toBeGreaterThanOrEqual(0);
  });
});

describe("mergeNewsTape", () => {
  const rows: NewsRow[] = [
    { id: "1", title: "NVDA beats earnings", source: "a", publishedAt: "2026-07-01" },
    { id: "1", title: "same id different feed", source: "b", publishedAt: "2026-07-02" },
    { id: "2", title: "NVDA Beats Earnings!", source: "c", publishedAt: "2026-06-30" },
    { id: "3", title: "AMD new chip", source: "d", publishedAt: "2026-07-03" },
  ];

  it("dedups by id and by normalized title, sorts newest-first", () => {
    const merged = mergeNewsTape(rows);
    expect(merged.map((r) => r.id)).toEqual(["3", "1"]); // id1 dup + id2 title-dup dropped; sorted desc
  });

  it("respects a limit", () => {
    expect(mergeNewsTape(rows, { limit: 1 }).map((r) => r.id)).toEqual(["3"]);
  });
});
