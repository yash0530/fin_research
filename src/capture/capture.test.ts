import { describe, it, expect } from "vitest";
import { parseCapture } from "./parse";
import { themeToSector } from "./theme-map";
import { renderPrompt } from "./render";

describe("parseCapture", () => {
  it("parses the strict JSON contract", () => {
    const r = parseCapture('{"items":[{"kind":"risk","ticker":"MU","text":"HBM oversupply"}]}');
    expect(r.parseStatus).toBe("json");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ kind: "risk", ticker: "MU" });
  });

  it("salvages JSON wrapped in prose/fences", () => {
    const r = parseCapture('Here you go:\n```json\n{"items":[{"kind":"catalyst","text":"GTC"}]}\n```');
    expect(r.parseStatus).toBe("json");
    expect(r.items[0].kind).toBe("catalyst");
  });

  it("falls back to legacy line parsing", () => {
    const raw = "- [catalyst] $NVDA GTC keynote\n- plain claim here\n$AMD gaining datacenter share";
    const r = parseCapture(raw);
    expect(r.parseStatus).toBe("legacy");
    expect(r.items.map((i) => i.kind)).toEqual(["catalyst", "claim", "ticker_mention"]);
    expect(r.items[0].ticker).toBe("NVDA");
    expect(r.items[2].ticker).toBe("AMD");
  });

  it("reports empty on blank input", () => {
    expect(parseCapture("   ").parseStatus).toBe("empty");
  });
});

describe("themeToSector", () => {
  it("maps known slugs and returns null for unknown", () => {
    expect(themeToSector("HBM")).toBe("ai_memory");
    expect(themeToSector("gpu")).toBe("ai_compute_gpu");
    expect(themeToSector("tulips")).toBeNull();
  });
});

describe("renderPrompt", () => {
  it("injects the watchlist and always appends the output contract", () => {
    const p = renderPrompt("daily_scan", { asOf: "2026-07-02", watchlist: ["MU", "NVDA"] });
    expect(p).toContain("MU, NVDA");
    expect(p).toContain("Return ONLY JSON");
  });

  it("injects the ticker for a ticker_check", () => {
    const p = renderPrompt("ticker_check", { asOf: "2026-07-02", ticker: "AMD", focus: "MI400 ramp" });
    expect(p).toContain("AMD");
    expect(p).toContain("MI400 ramp");
  });
});
