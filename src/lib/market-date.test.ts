import { describe, it, expect } from "vitest";
import { marketDate } from "./market-date";

describe("marketDate (America/New_York)", () => {
  it("returns YYYY-MM-DD", () => {
    expect(marketDate(new Date("2026-07-03T15:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("stays on the NY calendar date in the evening (UTC has already rolled over)", () => {
    // 2026-07-03 22:30 America/New_York = 2026-07-04 02:30 UTC. Market date must be Jul 3.
    expect(marketDate(new Date("2026-07-04T02:30:00Z"))).toBe("2026-07-03");
  });

  it("matches UTC midday when NY and UTC share the date", () => {
    expect(marketDate(new Date("2026-07-03T15:00:00Z"))).toBe("2026-07-03");
  });
});
