import { describe, it, expect } from "vitest";
import {
  SUPERINVESTORS,
  normalizeCik,
  getSuperinvestorByCik,
  getSuperinvestorBySlug,
} from "./superinvestors";

describe("superinvestors config", () => {
  it("defines Berkshire Hathaway CIK", () => {
    const berkshire = SUPERINVESTORS.find((s) => s.slug === "berkshire");
    expect(berkshire).toBeDefined();
    expect(berkshire?.cik).toBe("0001067983");
  });

  it("normalizes CIKs properly", () => {
    expect(normalizeCik("1067983")).toBe("0001067983");
    expect(normalizeCik("0001067983")).toBe("0001067983");
    expect(normalizeCik("CIK 0001067983")).toBe("0001067983");
  });

  it("finds superinvestors by CIK (padded or unpadded)", () => {
    const s1 = getSuperinvestorByCik("0001067983");
    expect(s1).toBeDefined();
    expect(s1?.slug).toBe("berkshire");

    const s2 = getSuperinvestorByCik("1067983");
    expect(s2).toBeDefined();
    expect(s2?.slug).toBe("berkshire");

    const s3 = getSuperinvestorByCik("9999999999");
    expect(s3).toBeUndefined();
  });

  it("finds superinvestors by slug", () => {
    const s1 = getSuperinvestorBySlug("berkshire");
    expect(s1).toBeDefined();
    expect(s1?.name).toBe("Berkshire Hathaway Inc");

    const s2 = getSuperinvestorBySlug("  SCION ");
    expect(s2).toBeDefined();
    expect(s2?.name).toBe("Scion Asset Management, LLC");

    const s3 = getSuperinvestorBySlug("non-existent");
    expect(s3).toBeUndefined();
  });
});
