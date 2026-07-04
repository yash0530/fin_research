import { describe, it, expect } from "vitest";
import { parseCompanyFacts, type CompanyFacts } from "./edgar-facts";

// Synthetic facts mirroring the real companyfacts shape: each end date carries BOTH
// a cumulative point (start = fiscal-year start) and a clean 90-day single-quarter
// point — the parser must take the single quarter and ignore the cumulative.
const FY = "2025-06-01"; // fiscal-year start
function q(startISO: string, endISO: string, val: number, fp: string) {
  return { start: startISO, end: endISO, val, fy: 2025, fp, form: "10-Q" as const };
}
const FACTS: CompanyFacts = {
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            q(FY, "2025-08-31", 100, "Q1"), // 91d single quarter
            q(FY, "2025-11-30", 250, "Q2"), // 182d CUMULATIVE — must be ignored
            q("2025-09-01", "2025-11-30", 150, "Q2"), // 90d single quarter
            // FY total for Q4 derivation: 91+90+? ... provide 3 quarters + annual
            q("2025-12-01", "2026-02-28", 200, "Q3"), // 89d single quarter
            { start: FY, end: "2026-05-31", val: 600, fy: 2025, fp: "FY", form: "10-K" as const }, // 364d annual
          ],
        },
      },
      NetIncomeLoss: { units: { USD: [q(FY, "2025-08-31", 20, "Q1")] } },
      PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [q(FY, "2025-08-31", -15, "Q1")] } },
      NetCashProvidedByUsedInOperatingActivities: { units: { USD: [q(FY, "2025-08-31", 50, "Q1")] } },
      SellingGeneralAndAdministrativeExpense: { units: { USD: [q(FY, "2025-08-31", 30, "Q1")] } },
      DepreciationDepletionAndAmortization: { units: { USD: [q(FY, "2025-08-31", 15, "Q1")] } },
      AccountsReceivableNetCurrent: { units: { USD: [{ end: "2025-08-31", val: 400, fy: 2025, fp: "Q1", form: "10-Q" }] } },
      AssetsCurrent: { units: { USD: [{ end: "2025-08-31", val: 2000, fy: 2025, fp: "Q1", form: "10-Q" }] } },
      LiabilitiesCurrent: { units: { USD: [{ end: "2025-08-31", val: 1200, fy: 2025, fp: "Q1", form: "10-Q" }] } },
      RetainedEarningsAccumulatedDeficit: { units: { USD: [{ end: "2025-08-31", val: 800, fy: 2025, fp: "Q1", form: "10-Q" }] } },
      PropertyPlantAndEquipmentNet: { units: { USD: [{ end: "2025-08-31", val: 2500, fy: 2025, fp: "Q1", form: "10-Q" }] } },
      Assets: { units: { USD: [{ end: "2025-08-31", val: 5000, fy: 2025, fp: "Q1", form: "10-Q" }] } },
      StockholdersEquity: { units: { USD: [{ end: "2025-08-31", val: 3000, fy: 2025, fp: "Q1", form: "10-Q" }] } },
      LongTermDebtNoncurrent: { units: { USD: [{ end: "2025-08-31", val: 900, fy: 2025, fp: "Q1", form: "10-Q" }] } },
      LongTermDebtCurrent: { units: { USD: [{ end: "2025-08-31", val: 100, fy: 2025, fp: "Q1", form: "10-Q" }] } },
    },
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: { shares: [{ end: "2025-08-31", val: 1_100_000_000, fy: 2025, fp: "Q1", form: "10-Q" }] },
      },
    },
  },
};

describe("parseCompanyFacts", () => {
  const rows = parseCompanyFacts("mu", FACTS);
  const byEnd = Object.fromEntries(rows.map((r) => [r.periodEnd, r]));

  it("takes single-quarter flows, never cumulative", () => {
    expect(byEnd["2025-08-31"].revenue).toBe(100);
    expect(byEnd["2025-11-30"].revenue).toBe(150); // the 90d point, NOT the 250 cumulative
    expect(byEnd["2026-02-28"].revenue).toBe(200);
  });

  it("derives Q4 from the fiscal-year total minus the three quarters", () => {
    // FY 600 − (100 + 150 + 200) = 150
    expect(byEnd["2026-05-31"].revenue).toBe(150);
  });

  it("captures instant snapshots and sums total debt", () => {
    expect(byEnd["2025-08-31"].totalAssets).toBe(5000);
    expect(byEnd["2025-08-31"].equity).toBe(3000);
    expect(byEnd["2025-08-31"].totalDebt).toBe(1000); // 900 + 100
    expect(byEnd["2025-08-31"].sharesOut).toBe(1_100_000_000);
    expect(byEnd["2025-08-31"].cfo).toBe(50);
    expect(byEnd["2025-08-31"].capex).toBe(15); // Math.abs(-15)
    expect(byEnd["2025-08-31"].fcf).toBe(35); // 50 - 15
    expect(byEnd["2025-08-31"].sga).toBe(30);
    expect(byEnd["2025-08-31"].depreciation).toBe(15);
    expect(byEnd["2025-08-31"].receivables).toBe(400);
    expect(byEnd["2025-08-31"].currentAssets).toBe(2000);
    expect(byEnd["2025-08-31"].currentLiabilities).toBe(1200);
    expect(byEnd["2025-08-31"].retainedEarnings).toBe(800);
    expect(byEnd["2025-08-31"].ppe).toBe(2500);

    // Verify other periods have nulls for these fields since they are not provided
    expect(byEnd["2025-11-30"].cfo).toBeNull();
    expect(byEnd["2025-11-30"].receivables).toBeNull();
  });

  it("uppercases the symbol and sorts by period-end", () => {
    expect(rows[0].symbol).toBe("MU");
    const ends = rows.map((r) => r.periodEnd);
    expect(ends).toEqual([...ends].sort());
  });

  it("returns [] on empty/missing facts", () => {
    expect(parseCompanyFacts("X", {})).toEqual([]);
    expect(parseCompanyFacts("X", { facts: {} })).toEqual([]);
  });
});
