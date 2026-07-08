import { describe, expect, it } from "vitest";
import {
  smaSeries,
  emaSeries,
  rsiSeries,
  macdSeries,
  scaleValue,
} from "./chart-math";

describe("chart-math SMA series", () => {
  it("computes SMA series correctly", () => {
    const values = [10, 20, 30, 40, 50];
    const period = 3;
    const res = smaSeries(values, period);
    expect(res).toEqual([null, null, 20, 30, 40]);
  });

  it("handles short series", () => {
    const values = [10, 20];
    const period = 3;
    const res = smaSeries(values, period);
    expect(res).toEqual([null, null]);
  });
});

describe("chart-math EMA series", () => {
  it("computes EMA series starting with first value", () => {
    const values = [10, 20, 30];
    const period = 2;
    const res = emaSeries(values, period);
    // k = 2 / 3.
    // e0 = 10
    // e1 = 20 * (2/3) + 10 * (1/3) = 16.6667
    // e2 = 30 * (2/3) + 16.6667 * (1/3) = 20 + 5.5556 = 25.5556
    expect(res[0]).toBe(10);
    expect(res[1]).toBeCloseTo(16.6667, 4);
    expect(res[2]).toBeCloseTo(25.5556, 4);
  });
});

describe("chart-math RSI series", () => {
  it("computes Wilder RSI series", () => {
    // Generate some prices
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i * (i % 2 === 0 ? 1 : -1));
    const rsi = rsiSeries(prices, 14);
    expect(rsi.length).toBe(prices.length);
    expect(rsi[0]).toBeNull();
    expect(rsi[13]).toBeNull();
    expect(rsi[14]).not.toBeNull();
  });
});

describe("chart-math MACD series", () => {
  it("computes MACD points starting from slow period", () => {
    const prices = Array.from({ length: 35 }, (_, i) => 10 + i * 0.5);
    const macd = macdSeries(prices, 12, 26, 9);
    expect(macd.length).toBe(prices.length);
    expect(macd[0]).toEqual({ macd: null, signal: null, histogram: null });
    expect(macd[24]).toEqual({ macd: null, signal: null, histogram: null });
    expect(macd[25].macd).not.toBeNull();
    expect(macd[25].signal).not.toBeNull();
    expect(macd[25].histogram).not.toBeNull();
  });
});

describe("chart-math scaleValue", () => {
  it("scales values to correct pixel ranges", () => {
    const scale = {
      domainMin: 100,
      domainMax: 200,
      rangeMin: 0,
      rangeMax: 500,
    };
    expect(scaleValue(100, scale)).toBe(0);
    expect(scaleValue(200, scale)).toBe(500);
    expect(scaleValue(150, scale)).toBe(250);
  });
});
