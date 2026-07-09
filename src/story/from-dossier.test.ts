import { describe, it, expect } from "vitest";
import { money } from "./from-dossier";

describe("money (compact USD label)", () => {
  it("formats raw-dollar amounts, not millions (regression: revenue was 1000x too large)", () => {
    // HUM quarterly revenue is stored as 39_648_000_000 → "$39.6B", NOT "$39648000B".
    expect(money(39_648_000_000)).toBe("$39.6B");
    expect(money(111_184_000_000)).toBe("$111.2B");
  });

  it("scales through B / M / K / $ by magnitude", () => {
    expect(money(2_500_000_000)).toBe("$2.5B");
    expect(money(750_000_000)).toBe("$750M");
    expect(money(4_200_000)).toBe("$4M");
    expect(money(85_000)).toBe("$85K");
    expect(money(420)).toBe("$420");
  });

  it("handles negatives and zero", () => {
    expect(money(-39_648_000_000)).toBe("$-39.6B");
    expect(money(0)).toBe("$0");
  });
});
