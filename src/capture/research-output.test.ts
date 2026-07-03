import { describe, expect, it } from "vitest";
import { parseSignalDeskBlock, parseResearchOutput } from "./parse";

// Ported from ResearchApp/tests/parser.test.ts — exercises the full OUTPUT_FORMAT
// contract: the primary fenced-`json` block with all 10 arrays, the legacy
// pipe-delimited SIGNAL_DESK block, malformed-line tolerance, and JSON type safety.

describe("parseSignalDeskBlock (legacy pipe block)", () => {
  it("parses a valid Signal Desk block", () => {
    const parsed = parseSignalDeskBlock(`
Readable report first.

SIGNAL_DESK_DATA_START
THEME|theme=ai_memory|cycle=heating_up|crowding=high|confidence=4|summary=HBM tightness
TICKER|ticker=MU|theme=ai_memory|sentiment=bullish|confidence=4|role=HBM beneficiary
CLAIM|text=HBM demand is supply constrained|ticker=MU|theme=ai_memory|confidence=4|importance=high|source_url=https://example.com
RISK|text=DRAM pricing rolls over|ticker=MU|theme=ai_memory|severity=high|timeframe=next_quarter
CATALYST|text=Guide moves higher|ticker=MU|theme=ai_memory|importance=medium|timeframe=next_quarter
TARGET|ticker=MU|firm=UBS|rating=buy|target=155|previous_target=140|date=2026-05-20
WATCH|text=Gross margin guide|ticker=MU|theme=ai_memory|timeframe=next_2_quarters
VERDICT|ticker=MU|theme=ai_memory|stance=RESEARCH_NOW|priority=4|horizon=next_12_months|rationale=Strong structural driver
DISCOVERY_TICKER|ticker=ALAB|company=Astera Labs|theme=ai_networking|reason=connectivity exposure
QUESTION|text=Is this thesis too dependent on one hyperscaler capex cycle?|ticker=MU|theme=ai_memory
SIGNAL_DESK_DATA_END
`);
    expect(parsed.themeSignals).toHaveLength(1);
    expect(parsed.tickerMentions[0]).toMatchObject({ ticker: "MU", sentiment: "BULLISH" });
    expect(parsed.claims[0].importance).toBe("HIGH");
    expect(parsed.risks[0].severity).toBe("HIGH");
    expect(parsed.analystTargets[0].target).toBe(155);
    expect(parsed.verdicts).toHaveLength(1);
    expect(parsed.verdicts[0]).toMatchObject({ ticker: "MU", stance: "RESEARCH_NOW", priority: 4, rationale: "Strong structural driver" });
    expect(parsed.discoveries[0].symbol).toBe("ALAB");
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0]).toMatchObject({ text: "Is this thesis too dependent on one hyperscaler capex cycle?", ticker: "MU" });
  });

  it("ignores malformed lines without failing", () => {
    const parsed = parseSignalDeskBlock(`
SIGNAL_DESK_DATA_START
CLAIM|ticker=MU|confidence=4
TOTALLY_UNKNOWN|foo=bar
TARGET|ticker=MU|target=not-a-number
SIGNAL_DESK_DATA_END
`);
    expect(parsed.claims).toHaveLength(0);
    expect(parsed.analystTargets).toHaveLength(1);
    expect(parsed.analystTargets[0].target).toBeUndefined();
    expect(parsed.ignoredLines).toHaveLength(2);
  });

  it("returns empty arrays when no block exists", () => {
    const parsed = parseSignalDeskBlock("plain old text");
    expect(parsed.lineCount).toBe(0);
    expect(parsed.claims).toEqual([]);
  });
});

describe("parseResearchOutput (fenced JSON contract)", () => {
  it("parses a valid markdown report + valid JSON code block with all groups", () => {
    const raw = `
# Executive Summary
The HBM market is seeing unprecedented growth.

| Ticker | Price | Metric |
|--------|-------|--------|
| MU     | $155  | HBM3E  |

\`\`\`json
{
  "themes": [{"theme":"ai_memory","cycle":"heating_up","crowding":"high","confidence":4,"summary":"HBM tightness"}],
  "tickers": [{"ticker":"MU","theme":"ai_memory","sentiment":"bullish","confidence":4,"role":"HBM beneficiary"}],
  "claims": [{"text":"HBM demand is supply constrained","ticker":"MU","theme":"ai_memory","confidence":4,"importance":"high"}],
  "risks": [{"text":"DRAM pricing rolls over","ticker":"MU","theme":"ai_memory","severity":"high","timeframe":"next_quarter"}],
  "catalysts": [{"text":"Guidance raised","ticker":"MU","theme":"ai_memory","importance":"medium","timeframe":"next_quarter"}],
  "targets": [{"ticker":"MU","firm":"UBS","rating":"buy","target":155,"previous_target":140,"date":"2026-05-20"}],
  "watch": [{"text":"Gross margin guide","ticker":"MU","theme":"ai_memory","timeframe":"next_2_quarters"}],
  "verdicts": [{"ticker":"MU","theme":"ai_memory","stance":"RESEARCH_NOW","priority":4,"horizon":"next_12_months","rationale":"Structural demand driver."}],
  "discoveries": [{"ticker":"ALAB","company":"Astera Labs","theme":"ai_networking","reason":"connectivity exposure"}],
  "questions": [{"text":"Too dependent on one hyperscaler capex cycle?","ticker":"MU","theme":"ai_memory"}]
}
\`\`\`
`;
    const parsed = parseResearchOutput(raw);
    expect(parsed.ignoredLines).toHaveLength(0);
    expect(parsed.themeSignals[0]).toMatchObject({ themeSlug: "ai_memory", cycle: "HEATING_UP", crowding: "HIGH", confidence: 4, summary: "HBM tightness" });
    expect(parsed.tickerMentions[0]).toMatchObject({ ticker: "MU", sentiment: "BULLISH", confidence: 4, role: "HBM beneficiary" });
    expect(parsed.claims[0]).toMatchObject({ text: "HBM demand is supply constrained", ticker: "MU", importance: "HIGH" });
    expect(parsed.risks[0]).toMatchObject({ text: "DRAM pricing rolls over", ticker: "MU", severity: "HIGH", timeframe: "next_quarter" });
    expect(parsed.catalysts[0]).toMatchObject({ text: "Guidance raised", ticker: "MU", importance: "MEDIUM", timeframe: "next_quarter" });
    expect(parsed.analystTargets[0]).toMatchObject({ ticker: "MU", firm: "UBS", rating: "buy", target: 155, previousTarget: 140 });
    expect(parsed.watchItems[0]).toMatchObject({ text: "Gross margin guide", ticker: "MU", timeframe: "next_2_quarters" });
    expect(parsed.verdicts[0]).toMatchObject({ ticker: "MU", stance: "RESEARCH_NOW", priority: 4, rationale: "Structural demand driver." });
    expect(parsed.discoveries[0]).toMatchObject({ symbol: "ALAB", companyName: "Astera Labs", suggestedTheme: "ai_networking" });
    expect(parsed.questions[0]).toMatchObject({ text: "Too dependent on one hyperscaler capex cycle?", ticker: "MU" });
  });

  it("filters an invalid stance and a missing rationale into ignoredLines", () => {
    const raw = `
\`\`\`json
{
  "verdicts": [
    {"ticker":"MU","theme":"ai_memory","stance":"MAYBE","priority":4,"horizon":"next_12_months","rationale":"Invalid stance"},
    {"ticker":"MU","theme":"ai_memory","stance":"RESEARCH_NOW","priority":4,"horizon":"next_12_months"}
  ]
}
\`\`\`
`;
    const parsed = parseResearchOutput(raw);
    expect(parsed.verdicts).toHaveLength(0);
    expect(parsed.ignoredLines).toHaveLength(2);
  });

  it("falls back to legacy SIGNAL_DESK block when no fenced json block is found", () => {
    const raw = `
Readable report first.

SIGNAL_DESK_DATA_START
THEME|theme=ai_memory|cycle=heating_up|crowding=high|confidence=4|summary=HBM tightness
SIGNAL_DESK_DATA_END
`;
    const parsed = parseResearchOutput(raw);
    expect(parsed.themeSignals).toHaveLength(1);
    expect(parsed.themeSignals[0].themeSlug).toBe("ai_memory");
    expect(parsed.ignoredLines).toHaveLength(0);
  });

  it("catches an invalid JSON block and records an ignoredLines error", () => {
    const raw = `
\`\`\`json
{
  "themes": [{"theme": "ai_memory", "cycle": "heating_up"
}
\`\`\`
`;
    const parsed = parseResearchOutput(raw);
    expect(parsed.themeSignals).toHaveLength(0);
    expect(parsed.ignoredLines).toHaveLength(1);
    expect(parsed.ignoredLines[0]).toContain("Found a ```json block but it failed to parse as JSON.");
  });

  it("handles unexpected JSON types without throwing", () => {
    const raw = `
\`\`\`json
{
  "themes": [{ "theme": 123, "cycle": true, "crowding": ["high"], "confidence": {}, "summary": false }],
  "tickers": [{ "ticker": true, "theme": ["memory"], "sentiment": 999, "confidence": [] }],
  "claims": [{ "text": 456, "ticker": {}, "confidence": false, "importance": true, "sourceUrl": [] }],
  "targets": [{ "ticker": 7203, "target": true, "previousTarget": [], "date": {} }]
}
\`\`\`
`;
    const parsed = parseResearchOutput(raw);
    expect(parsed.themeSignals).toHaveLength(1);
    expect(parsed.themeSignals[0].themeSlug).toBe("123"); // numbers → string
    expect(parsed.themeSignals[0].cycle).toBeUndefined();
    expect(parsed.themeSignals[0].crowding).toBeUndefined();
    expect(parsed.themeSignals[0].confidence).toBeUndefined();
    expect(parsed.themeSignals[0].summary).toBe("false"); // boolean → string
    expect(parsed.tickerMentions).toHaveLength(0); // ticker:true invalid
    expect(parsed.claims).toHaveLength(1);
    expect(parsed.claims[0].text).toBe("456");
    expect(parsed.analystTargets).toHaveLength(1);
    expect(parsed.analystTargets[0].ticker).toBe("7203");
    expect(parsed.analystTargets[0].target).toBeUndefined();
    expect(parsed.analystTargets[0].previousTarget).toBeUndefined();
    expect(parsed.analystTargets[0].date).toBeUndefined();
  });
});
