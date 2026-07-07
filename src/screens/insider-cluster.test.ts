import { describe, it, expect } from "vitest";
import { checkInsiderCluster } from "./insider-cluster";
import type { InsiderTxLike } from "./types";

function makeTx(overrides: Partial<InsiderTxLike>): InsiderTxLike {
  return {
    filerName: "Cook Tim",
    filerRole: "Director",
    txDate: "2023-10-01",
    value: 100000,
    tenPercentOwner: 0,
    tenB51: 0,
    ...overrides,
  };
}

describe("Insider Cluster Screen Rule", () => {
  it("triggers Large Cap cluster when >=2 distinct and >=$500k in 30 days", () => {
    const txs = [
      makeTx({ filerName: "Insider A", txDate: "2023-10-01", value: 300000 }),
      makeTx({ filerName: "Insider B", txDate: "2023-10-15", value: 250000 }),
    ];
    const result = checkInsiderCluster(txs, 25_000_000_000); // 25B (Large Cap)
    expect(result.clustered).toBe(true);
    expect(result.windowStart).toBe("2023-10-01");
    expect(result.insiders).toContain("Insider A");
    expect(result.insiders).toContain("Insider B");
    expect(result.totalValue).toBe(550000);
  });

  it("does not trigger Large Cap cluster if total value is <$500k", () => {
    const txs = [
      makeTx({ filerName: "Insider A", txDate: "2023-10-01", value: 300000 }),
      makeTx({ filerName: "Insider B", txDate: "2023-10-15", value: 150000 }),
    ];
    const result = checkInsiderCluster(txs, 25_000_000_000);
    expect(result.clustered).toBe(false);
  });

  it("triggers Small Cap cluster when >=3 distinct and >=$100k in 30 days", () => {
    const txs = [
      makeTx({ filerName: "Insider A", txDate: "2023-10-01", value: 40000 }),
      makeTx({ filerName: "Insider B", txDate: "2023-10-10", value: 40000 }),
      makeTx({ filerName: "Insider C", txDate: "2023-10-20", value: 30000 }),
    ];
    const result = checkInsiderCluster(txs, 5_000_000_000); // 5B (Small Cap)
    expect(result.clustered).toBe(true);
    expect(result.totalValue).toBe(110000);
  });

  it("excludes 10b5-1 transactions from clustering", () => {
    const txs = [
      makeTx({ filerName: "Insider A", txDate: "2023-10-01", value: 300000 }),
      makeTx({ filerName: "Insider B", txDate: "2023-10-15", value: 250000, tenB51: 1 }),
    ];
    const result = checkInsiderCluster(txs, 25_000_000_000);
    expect(result.clustered).toBe(false);
  });

  it("excludes passive 10% owners (10% owner role without director/officer)", () => {
    const txs = [
      makeTx({ filerName: "Insider A", txDate: "2023-10-01", value: 300000 }),
      // Passive 10% owner: tenPercentOwner = 1, filerRole has no director or officer
      makeTx({
        filerName: "Insider B",
        txDate: "2023-10-15",
        value: 250000,
        tenPercentOwner: 1,
        filerRole: "10% Owner",
      }),
    ];
    const result = checkInsiderCluster(txs, 25_000_000_000);
    expect(result.clustered).toBe(false);
  });

  it("keeps active 10% owners who are also directors or officers", () => {
    const txs = [
      makeTx({ filerName: "Insider A", txDate: "2023-10-01", value: 300000 }),
      // Active 10% owner: tenPercentOwner = 1, filerRole has Director
      makeTx({
        filerName: "Insider B",
        txDate: "2023-10-15",
        value: 250000,
        tenPercentOwner: 1,
        filerRole: "Director, 10% Owner",
      }),
    ];
    const result = checkInsiderCluster(txs, 25_000_000_000);
    expect(result.clustered).toBe(true);
  });

  it("evaluates rolling 30-day window limits strictly", () => {
    const txs = [
      makeTx({ filerName: "Insider A", txDate: "2023-10-01", value: 300000 }),
      // Outside 30-day window (31 days later)
      makeTx({ filerName: "Insider B", txDate: "2023-11-01", value: 250000 }),
    ];
    const result = checkInsiderCluster(txs, 25_000_000_000);
    expect(result.clustered).toBe(false);
  });
});
