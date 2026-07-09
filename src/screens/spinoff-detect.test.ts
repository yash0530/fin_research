import { describe, it, expect } from "vitest";
import { detectSpinoff } from "./spinoff-detect";

describe("Spinoff Detector", () => {
  it("detects spinoff completed (item 2.01 + distribution keyword)", () => {
    const text = `
      Item 2.01 Completion of Acquisition or Disposition of Assets.
      The company completed the distribution of shares of the spin-off entity.
      The record date for the distribution was October 15, 2026.
    `;
    const signal = detectSpinoff(text, undefined, "TEST");
    expect(signal).not.toBeNull();
    expect(signal?.kind).toBe("spinoff-completed");
    expect(signal?.confidence).toBe("high");
    expect(signal?.parentSymbol).toBe("TEST");
    expect(signal?.headline).toBe("Spin-off Completed");
    expect(signal?.recordDateHint).toBe("October 15, 2026");
  });

  it("detects spinoff announcement (item 1.01 + separation agreement)", () => {
    const text = `
      Item 1.01 Entry into a Material Definitive Agreement.
      We entered into a separation agreement to spun off our division.
    `;
    const signal = detectSpinoff(text, undefined, "TEST");
    expect(signal).not.toBeNull();
    expect(signal?.kind).toBe("spinoff-announced");
    expect(signal?.confidence).toBe("high");
    expect(signal?.parentSymbol).toBe("TEST");
    expect(signal?.headline).toBe("Spin-off Announced");
  });

  it("detects spinoff from explicit keywords as medium confidence", () => {
    const text = `
      The company announced a tax-free distribution of common shares.
      The distribution ratio is 1 share for every 10 shares held.
    `;
    const signal = detectSpinoff(text, undefined, "TEST");
    expect(signal).not.toBeNull();
    expect(signal?.kind).toBe("spinoff-announced");
    expect(signal?.confidence).toBe("medium");
  });

  it("returns null for plain earnings 8-K", () => {
    const text = `
      Item 2.02 Results of Operations and Financial Condition.
      We reported earnings for the third quarter of 2026.
    `;
    const signal = detectSpinoff(text, undefined, "TEST");
    expect(signal).toBeNull();
  });

  it("returns null for false-friend text", () => {
    const text = `
      We are spinning up a new datacenter to handle the load.
    `;
    const signal = detectSpinoff(text, undefined, "TEST");
    expect(signal).toBeNull();
  });
});
