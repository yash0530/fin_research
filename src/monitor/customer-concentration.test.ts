import { describe, it, expect } from "vitest";
import { extractCustomerConcentration } from "./customer-concentration";

describe("customer-concentration extractor", () => {
  it("extracts high concentration from 'one customer accounted for 42% of revenue'", () => {
    const text = `
      <html>
        <body>
          <p>Item 1. Business.</p>
          <p>During the fiscal year ended December 31, 2025, one customer accounted for 42% of revenue.</p>
        </body>
      </html>
    `;
    const res = extractCustomerConcentration(text);
    expect(res.disclosed).toBe(true);
    expect(res.maxCustomerPct).toBe(42);
    expect(res.topNPct).toBeNull();
    expect(res.concentrationLevel).toBe("high");
    expect(res.evidence.length).toBe(1);
    expect(res.evidence[0]).toContain("one customer accounted for 42% of revenue");
  });

  it("extracts diversified level from 'no customer accounted for more than 10%'", () => {
    const text = `
      <p>During fiscal 2025, no single customer accounted for more than 10% of our consolidated revenues.</p>
    `;
    const res = extractCustomerConcentration(text);
    expect(res.disclosed).toBe(true);
    expect(res.maxCustomerPct).toBeNull();
    expect(res.concentrationLevel).toBe("diversified");
  });

  it("extracts named customer case with Apple/Amazon and sets level to high due to <= 3 named", () => {
    const text = `
      <p>During 2025, sales to Apple represented 15% of our net revenues and sales to Amazon were 12% of total revenues.</p>
    `;
    const res = extractCustomerConcentration(text);
    expect(res.disclosed).toBe(true);
    expect(res.maxCustomerPct).toBe(15);
    expect(res.namedCustomers).toContain("Apple");
    expect(res.namedCustomers).toContain("Amazon");
    expect(res.concentrationLevel).toBe("high"); // >= 10% from <= 3 named customers
  });

  it("returns none-disclosed for boilerplate and junk text", () => {
    const text = `
      <p>We are a leading provider of enterprise software solutions. We operate in a highly competitive market.</p>
    `;
    const res = extractCustomerConcentration(text);
    expect(res.disclosed).toBe(false);
    expect(res.concentrationLevel).toBe("none-disclosed");
    expect(res.maxCustomerPct).toBeNull();
    expect(res.namedCustomers).toEqual([]);
  });

  it("extracts top N customers concentration", () => {
    const text = `
      <p>Our top three customers represented 45% of our consolidated revenues for fiscal 2025.</p>
    `;
    const res = extractCustomerConcentration(text);
    expect(res.disclosed).toBe(true);
    expect(res.topNPct).toBe(45);
    expect(res.concentrationLevel).toBe("moderate"); // since maxCustomerPct is null and topNPct >= 20
  });

  it("handles null, empty, and invalid inputs gracefully", () => {
    const res1 = extractCustomerConcentration("");
    expect(res1.disclosed).toBe(false);
    expect(res1.concentrationLevel).toBe("none-disclosed");

    const res2 = extractCustomerConcentration(null as any);
    expect(res2.disclosed).toBe(false);
    expect(res2.concentrationLevel).toBe("none-disclosed");
  });
});
