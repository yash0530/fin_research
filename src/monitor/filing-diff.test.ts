import { describe, it, expect } from "vitest";
import {
  diffFilings,
  splitParagraphs,
  tokenSet,
  jaccard,
  isBoilerplate,
  hasCompanyTokens,
} from "./filing-diff";

// Synthetic 10-K pair for ACME: one unchanged business paragraph, two
// boilerplate recitals, one materially changed risk factor, one materially
// changed MD&A paragraph, and a generic-prose change that must be gated out.

const OLD_10K = `
<html><body>
<p>Item 1. Business</p>
<p>Acme Semiconductor designs memory controllers for data centers and licenses its Turbo Fabric interconnect to twelve hyperscale customers worldwide.</p>
<p>This report contains forward-looking statements within the meaning of the Private Securities Litigation Reform Act of 1995 and actual results may differ materially.</p>
<p>Item 1A. Risk Factors</p>
<p>Our revenue is concentrated among a small number of customers; our top three customers accounted for 45% of revenue in fiscal 2024.</p>
<p>We adopted ASC 606 revenue recognition guidance and do not expect recently issued accounting pronouncements to have a material effect.</p>
<p>we believe our culture supports innovation and collaboration across all of our teams and offices worldwide every single day</p>
<p>Item 7. Management Discussion</p>
<p>Gross margin was fifty-two percent in fiscal 2024 driven by favorable DDR5 pricing and higher Turbo Fabric royalties.</p>
</body></html>
`;

const NEW_10K = `
<html><body>
<p>Item 1. Business</p>
<p>Acme Semiconductor designs memory controllers for data centers and licenses its Turbo Fabric interconnect to twelve hyperscale customers worldwide.</p>
<p>This report contains forward-looking statements within the meaning of the Private Securities Litigation Reform Act of 1995 and actual results may differ materially.</p>
<p>Item 1A. Risk Factors</p>
<p>Customer concentration worsened materially: our top three customers accounted for 68% of revenue in fiscal 2025, and we lost a major hyperscale customer during the fourth quarter.</p>
<p>We adopted ASC 606 revenue recognition guidance and do not expect recently issued accounting pronouncements to have a material effect.</p>
<p>our people remain committed to operating with integrity while serving communities everywhere through consistent daily practice and care</p>
<p>Item 7. Management Discussion</p>
<p>Gross margin declined to 38 percent in fiscal 2025 as DDR5 contract pricing collapsed and Turbo Fabric royalty income fell sharply.</p>
</body></html>
`;

describe("filing-diff primitives", () => {
  it("splits paragraphs and tracks section headings", () => {
    const paras = splitParagraphs(OLD_10K);
    expect(paras.length).toBeGreaterThan(3);
    const risk = paras.find((p) => p.text.includes("top three customers"));
    expect(risk?.section).toMatch(/Item 1A/i);
    // Headings themselves are not emitted as paragraphs
    expect(paras.some((p) => p.text === "Item 1. Business")).toBe(false);
  });

  it("jaccard: identical sets are 1, disjoint sets are 0", () => {
    const a = tokenSet("gross margin declined 38 percent");
    expect(jaccard(a, a)).toBe(1);
    expect(jaccard(tokenSet("alpha beta"), tokenSet("gamma delta"))).toBe(0);
  });

  it("flags safe-harbor and ASC recitals as boilerplate", () => {
    expect(isBoilerplate("This report contains forward-looking statements ...")).toBe(true);
    expect(isBoilerplate("We adopted ASC 606 revenue recognition guidance")).toBe(true);
    expect(isBoilerplate("Gross margin declined to 38 percent")).toBe(false);
  });

  it("company-token gate: ticker, numbers, mid-sentence product nouns pass; generic prose fails", () => {
    expect(hasCompanyTokens("revenue was 68% of total", "ACME")).toBe(true);
    expect(hasCompanyTokens("as reported by ACME management", "ACME")).toBe(true);
    expect(hasCompanyTokens("we license our new product, Turbo Fabric interconnect", "ACME")).toBe(true);
    expect(
      hasCompanyTokens(
        "our people remain committed to operating with integrity while serving communities everywhere",
        "ACME",
      ),
    ).toBe(false);
  });
});

describe("diffFilings on a synthetic 10-K pair", () => {
  const result = diffFilings(OLD_10K, NEW_10K, "ACME");

  it("filters boilerplate from both docs", () => {
    expect(result.boilerplateDropped).toBeGreaterThanOrEqual(4); // 2 recitals × 2 docs
    for (const c of result.changed) {
      expect(c.after).not.toMatch(/forward-looking|ASC 606/i);
    }
  });

  it("counts the carried-over business paragraph as unchanged", () => {
    expect(result.unchanged).toBeGreaterThanOrEqual(1);
  });

  it("surfaces the real risk-factor and MD&A changes under the Jaccard threshold", () => {
    expect(result.changedCount).toBe(2);
    const sections = result.changed.map((c) => c.section).join(" | ");
    expect(sections).toMatch(/Item 1A/i);
    expect(sections).toMatch(/Item 7/i);
    for (const c of result.changed) {
      expect(c.jaccard).toBeLessThan(0.6);
      expect(c.before.length).toBeGreaterThan(0);
    }
    const risk = result.changed.find((c) => c.section.match(/Item 1A/i));
    expect(risk?.after).toContain("68%");
    expect(risk?.before).toContain("45%");
  });

  it("gates out the generic-prose change (no company-specific tokens)", () => {
    expect(result.changed.some((c) => c.after.includes("integrity"))).toBe(false);
  });

  it("fewer than 3 changes is fine — no padding", () => {
    expect(result.changed.length).toBe(2);
  });
});

describe("diffFilings top-3 cap", () => {
  const mkOld = (i: number) =>
    `<p>Product Line${i} shipped ${i * 100} units in fiscal 2024 with strong enterprise demand and record Line${i} backlog levels.</p>`;
  const mkNew = (i: number) =>
    `<p>Product Line${i} volumes collapsed to ${i * 7} units in fiscal 2025 after cancellations, and Line${i} inventory reserves rose sharply.</p>`;
  const oldDoc = `<p>Item 7. Management Discussion</p>${[1, 2, 3, 4, 5].map(mkOld).join("")}`;
  const newDoc = `<p>Item 7. Management Discussion</p>${[1, 2, 3, 4, 5].map(mkNew).join("")}`;

  it("caps output at 3 pairs but reports the honest total", () => {
    const r = diffFilings(oldDoc, newDoc, "ACME");
    expect(r.changedCount).toBe(5);
    expect(r.changed.length).toBe(3);
    // most-changed first
    for (let i = 1; i < r.changed.length; i++) {
      expect(r.changed[i].jaccard).toBeGreaterThanOrEqual(r.changed[i - 1].jaccard);
    }
  });
});
