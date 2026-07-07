import { describe, it, expect } from "vitest";
import { classify8k, extractItemsFromText } from "./eightk-classify";

describe("8-K Classifier", () => {
  it("extracts item numbers from text correctly", () => {
    const text = "We filed Item 1.01 and Item 2.02 today. Item 9.01 is ignored.";
    const items = extractItemsFromText(text);
    expect(items).toContain("1.01");
    expect(items).toContain("2.02");
    expect(items).toContain("9.01");
  });

  it("classifies Item 1.01 as material-agreement", () => {
    const text = "This is about Item 1.01 Entry into a Material Definitive Agreement.";
    const events = classify8k(text);
    expect(events).toHaveLength(1);
    expect(events[0].item).toBe("1.01");
    expect(events[0].kind).toBe("material-agreement");
    expect(events[0].severity).toBe("info");
  });

  it("classifies Item 2.02 as results/guidance without specific direction guidance", () => {
    const text = "We reported Item 2.02 earnings results for Q3.";
    const events = classify8k(text);
    expect(events).toHaveLength(1);
    expect(events[0].item).toBe("2.02");
    expect(events[0].kind).toBe("results/guidance");
  });

  it("classifies Item 2.02 with guidance raised as guidance-up", () => {
    const text = "Item 2.02: The company announced it raised its full year guidance.";
    const events = classify8k(text);
    expect(events).toHaveLength(1);
    expect(events[0].item).toBe("2.02");
    expect(events[0].kind).toBe("guidance-up");
    expect(events[0].headline).toContain("Guidance Raised");
  });

  it("classifies Item 2.02 with guidance lowered/withdrawn as guidance-down", () => {
    const text = "Item 2.02: The company announced it lowered full-year guidance.";
    const events = classify8k(text);
    expect(events).toHaveLength(1);
    expect(events[0].item).toBe("2.02");
    expect(events[0].kind).toBe("guidance-down");
  });

  it("classifies Item 2.02 with guidance withdrawn as guidance-down", () => {
    const text = "Item 2.02: The company is withdrawing guidance.";
    const events = classify8k(text);
    expect(events).toHaveLength(1);
    expect(events[0].item).toBe("2.02");
    expect(events[0].kind).toBe("guidance-down");
  });

  it("classifies Item 4.02 as non-reliance with critical severity", () => {
    const text = "Item 4.02 Non-Reliance on Previously Issued Financial Statements.";
    const events = classify8k(text);
    expect(events).toHaveLength(1);
    expect(events[0].item).toBe("4.02");
    expect(events[0].kind).toBe("non-reliance");
    expect(events[0].severity).toBe("critical");
  });

  it("classifies Item 5.02 as exec-change", () => {
    const text = "Item 5.02 Departure of Directors or Certain Officers; Election of Directors.";
    const events = classify8k(text);
    expect(events).toHaveLength(1);
    expect(events[0].item).toBe("5.02");
    expect(events[0].kind).toBe("exec-change");
  });

  it("ignores unspecified items like 9.01", () => {
    const text = "Item 9.01 Financial Statements and Exhibits.";
    const events = classify8k(text);
    expect(events).toHaveLength(0);
  });
});
