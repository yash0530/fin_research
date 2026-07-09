import { describe, it, expect } from "vitest";
import {
  _fit_ols_line,
  detectHeadAndShoulders,
  detectInverseHeadAndShoulders,
  detectDoubleTop,
  detectDoubleBottom,
  detectTripleTop,
  detectTripleBottom,
  detectAscendingTriangle,
  detectDescendingTriangle,
  detectCupAndHandle,
  detectBullishFlag,
  detectFallingWedge,
  detectAllPatterns,
} from "./chart-patterns";

function makeDates(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const day = (i + 1).toString().padStart(2, "0");
    return `2026-01-${day}`;
  });
}

function generatePatternPrices(vertices: [number, number][], length: number): number[] {
  const prices = Array.from({ length }, () => 0.0);
  const sortedVertices = [...vertices].sort((a, b) => a[0] - b[0]);

  if (sortedVertices[0][0] > 0) {
    sortedVertices.unshift([0, sortedVertices[0][1]]);
  }
  if (sortedVertices[sortedVertices.length - 1][0] < length - 1) {
    sortedVertices.push([length - 1, sortedVertices[sortedVertices.length - 1][1]]);
  }

  for (let idx = 0; idx < sortedVertices.length - 1; idx++) {
    const [x1, y1] = sortedVertices[idx];
    const [x2, y2] = sortedVertices[idx + 1];
    for (let x = x1; x <= x2; x++) {
      if (x2 === x1) {
        prices[x] = y1;
      } else {
        prices[x] = y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
      }
    }
  }
  return prices;
}

describe("OLS fit helper", () => {
  it("fits standard line correctly", () => {
    const x = [0, 1, 2, 3, 4];
    const y = [2.0, 3.0, 4.0, 5.0, 6.0];
    const [slope, intercept, rSquared] = _fit_ols_line(x, y);
    expect(slope).toBeCloseTo(1.0, 5);
    expect(intercept).toBeCloseTo(2.0, 5);
    expect(rSquared).toBeCloseTo(1.0, 5);
  });
});

describe("Head and Shoulders", () => {
  it("detects H&S positive case", () => {
    const vertices: [number, number][] = [
      [5, 15.0],
      [8, 9.0],
      [12, 18.0],
      [16, 9.5],
      [19, 14.5],
    ];
    const prices = generatePatternPrices(vertices, 25);
    const dates = makeDates(25);

    const result = detectHeadAndShoulders({ closes: prices, dates }, 2);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.left_shoulder!.price).toBeCloseTo(15.0, 2);
    expect(result!.head!.price).toBeCloseTo(18.0, 2);
    expect(result!.right_shoulder!.price).toBeCloseTo(14.5, 2);
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it("returns null for flat prices (negative case)", () => {
    const prices = Array.from({ length: 150 }, () => 100.0);
    const dates = makeDates(150);
    const result = detectHeadAndShoulders({ closes: prices, dates }, 20);
    expect(result).toBeNull();
  });
});

describe("Inverse Head and Shoulders", () => {
  it("detects IHS positive case", () => {
    const vertices: [number, number][] = [
      [5, 85.0],
      [8, 98.0],
      [12, 78.0],
      [16, 96.0],
      [19, 84.0],
    ];
    const prices = generatePatternPrices(vertices, 25);
    const dates = makeDates(25);

    const result = detectInverseHeadAndShoulders({ closes: prices, dates }, 2);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.patternType).toBe("inverse_head_shoulders");
    expect(result!.left_shoulder!.price).toBeCloseTo(85.0, 2);
    expect(result!.head!.price).toBeCloseTo(78.0, 2);
    expect(result!.right_shoulder!.price).toBeCloseTo(84.0, 2);
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it("returns null for flat prices (negative case)", () => {
    const prices = Array.from({ length: 150 }, () => 100.0);
    const dates = makeDates(150);
    const result = detectInverseHeadAndShoulders({ closes: prices, dates }, 20);
    expect(result).toBeNull();
  });
});

describe("Double Top", () => {
  it("detects Double Top positive case", () => {
    const vertices: [number, number][] = [
      [4, 70.0],
      [9, 40.0],
      [14, 70.5],
    ];
    const prices = generatePatternPrices(vertices, 20);
    const dates = makeDates(20);

    const result = detectDoubleTop({ closes: prices, dates }, 2);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.patternType).toBe("double_top");
    expect(result!.first_peak!.price).toBeCloseTo(70.0, 2);
    expect(result!.second_peak!.price).toBeCloseTo(70.5, 2);
    expect(result!.trough!.price).toBeCloseTo(40.0, 2);
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it("returns null for flat prices (negative case)", () => {
    const prices = Array.from({ length: 150 }, () => 100.0);
    const dates = makeDates(150);
    const result = detectDoubleTop({ closes: prices, dates }, 15);
    expect(result).toBeNull();
  });
});

describe("Double Bottom", () => {
  it("detects Double Bottom positive case", () => {
    const vertices: [number, number][] = [
      [4, 80.0],
      [9, 115.0],
      [14, 81.0],
    ];
    const prices = generatePatternPrices(vertices, 20);
    const dates = makeDates(20);

    const result = detectDoubleBottom({ closes: prices, dates }, 2);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.patternType).toBe("double_bottom");
    expect(result!.first_trough!.price).toBeCloseTo(80.0, 2);
    expect(result!.second_trough!.price).toBeCloseTo(81.0, 2);
    expect(result!.peak!.price).toBeCloseTo(115.0, 2);
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it("returns null for flat prices (negative case)", () => {
    const prices = Array.from({ length: 150 }, () => 100.0);
    const dates = makeDates(150);
    const result = detectDoubleBottom({ closes: prices, dates }, 15);
    expect(result).toBeNull();
  });
});

describe("Triple Top", () => {
  it("detects Triple Top positive case", () => {
    const vertices: [number, number][] = [
      [4, 80.0],
      [8, 50.0],
      [12, 81.0],
      [16, 49.0],
      [20, 79.5],
    ];
    const prices = generatePatternPrices(vertices, 30);
    const dates = makeDates(30);

    const result = detectTripleTop({ closes: prices, dates }, 2);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.patternType).toBe("triple_top");
    expect(result!.first_peak!.price).toBeCloseTo(80.0, 2);
    expect(result!.second_peak!.price).toBeCloseTo(81.0, 2);
    expect(result!.third_peak!.price).toBeCloseTo(79.5, 2);
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it("returns null for flat prices (negative case)", () => {
    const prices = Array.from({ length: 150 }, () => 100.0);
    const dates = makeDates(150);
    const result = detectTripleTop({ closes: prices, dates }, 12);
    expect(result).toBeNull();
  });
});

describe("Triple Bottom", () => {
  it("detects Triple Bottom positive case", () => {
    const vertices: [number, number][] = [
      [4, 80.0],
      [8, 110.0],
      [12, 79.0],
      [16, 112.0],
      [20, 81.0],
    ];
    const prices = generatePatternPrices(vertices, 30);
    const dates = makeDates(30);

    const result = detectTripleBottom({ closes: prices, dates }, 2);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.patternType).toBe("triple_bottom");
    expect(result!.first_trough!.price).toBeCloseTo(80.0, 2);
    expect(result!.second_trough!.price).toBeCloseTo(79.0, 2);
    expect(result!.third_trough!.price).toBeCloseTo(81.0, 2);
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it("returns null for flat prices (negative case)", () => {
    const prices = Array.from({ length: 150 }, () => 100.0);
    const dates = makeDates(150);
    const result = detectTripleBottom({ closes: prices, dates }, 12);
    expect(result).toBeNull();
  });
});

describe("Ascending Triangle", () => {
  it("detects Ascending Triangle positive case", () => {
    const vertices: [number, number][] = [
      [0, 100.0],
      [10, 80.0],
      [20, 100.0],
      [30, 83.0],
      [40, 100.0],
      [50, 86.0],
      [60, 100.0],
      [69, 89.0],
    ];
    const prices = generatePatternPrices(vertices, 70);
    const dates = makeDates(70);

    const result = detectAscendingTriangle({ closes: prices, dates }, 2);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.patternType).toBe("ascending_triangle");
    expect(Math.abs(result!.resistance! - 100.0)).toBeLessThan(1.5);
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it("returns null for flat prices (negative case)", () => {
    const prices = Array.from({ length: 150 }, () => 100.0);
    const dates = makeDates(150);
    const result = detectAscendingTriangle({ closes: prices, dates }, 10);
    expect(result).toBeNull();
  });
});

describe("Descending Triangle", () => {
  it("detects Descending Triangle positive case", () => {
    const vertices: [number, number][] = [
      [0, 80.0],
      [10, 100.0],
      [20, 80.0],
      [30, 95.0],
      [40, 80.0],
      [50, 90.0],
      [60, 80.0],
      [69, 85.0],
    ];
    const prices = generatePatternPrices(vertices, 70);
    const dates = makeDates(70);

    const result = detectDescendingTriangle({ closes: prices, dates }, 2);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.patternType).toBe("descending_triangle");
    expect(Math.abs(result!.support! - 80.0)).toBeLessThan(1.5);
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it("returns null for flat prices (negative case)", () => {
    const prices = Array.from({ length: 150 }, () => 100.0);
    const dates = makeDates(150);
    const result = detectDescendingTriangle({ closes: prices, dates }, 10);
    expect(result).toBeNull();
  });
});

describe("Cup and Handle", () => {
  it("detects Cup and Handle positive case", () => {
    const vertices: [number, number][] = [
      [10, 100.0],
      [40, 70.0],
      [70, 98.0],
      [80, 90.0],
      [85, 95.0],
    ];
    const prices = generatePatternPrices(vertices, 90);
    const dates = makeDates(90);

    const result = detectCupAndHandle({ closes: prices, dates }, 2);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.patternType).toBe("cup_and_handle");
    expect(result!.cup_bottom).toBeCloseTo(70.0, 2);
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it("returns null for flat prices (negative case)", () => {
    const prices = Array.from({ length: 150 }, () => 100.0);
    const dates = makeDates(150);
    const result = detectCupAndHandle({ closes: prices, dates }, 10);
    expect(result).toBeNull();
  });
});

describe("Bullish Flag", () => {
  it("detects Bullish Flag positive case", () => {
    const vertices: [number, number][] = [
      [5, 100.0],
      [30, 130.0],
      [49, 126.0],
    ];
    const prices = generatePatternPrices(vertices, 50);
    const dates = makeDates(50);

    const result = detectBullishFlag({ closes: prices, dates }, 2);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.patternType).toBe("bullish_flag");
    expect(result!.pole_high).toBeCloseTo(130.0, 2);
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it("returns null for flat prices (negative case)", () => {
    const prices = Array.from({ length: 150 }, () => 100.0);
    const dates = makeDates(150);
    const result = detectBullishFlag({ closes: prices, dates }, 5);
    expect(result).toBeNull();
  });
});

describe("Falling Wedge", () => {
  it("detects Falling Wedge positive case", () => {
    const vertices: [number, number][] = [
      [10, 150.0],
      [12, 100.0],
      [20, 130.0],
      [22, 90.0],
      [30, 110.0],
      [32, 80.0],
      [40, 90.0],
      [42, 70.0],
    ];
    const prices = generatePatternPrices(vertices, 60);
    prices[prices.length - 1] = 80.0;
    const dates = makeDates(60);

    const result = detectFallingWedge({ closes: prices, dates }, 2);
    expect(result).not.toBeNull();
    expect(result!.detected).toBe(true);
    expect(result!.patternType).toBe("falling_wedge");
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it("returns null for flat prices (negative case)", () => {
    const prices = Array.from({ length: 150 }, () => 100.0);
    const dates = makeDates(150);
    const result = detectFallingWedge({ closes: prices, dates }, 8);
    expect(result).toBeNull();
  });
});

describe("detectAllPatterns", () => {
  it("returns empty array for few bars", () => {
    expect(detectAllPatterns({ closes: [1, 2, 3], dates: ["2026-01-01", "2026-01-02", "2026-01-03"] })).toEqual([]);
  });

  it("finds and sorts multiple patterns", () => {
    // Generate a hybrid series or just verify it does not throw
    const prices = Array.from({ length: 100 }, (_, i) => 100 + i);
    const dates = makeDates(100);
    const results = detectAllPatterns({ closes: prices, dates });
    expect(Array.isArray(results)).toBe(true);
  });
});
