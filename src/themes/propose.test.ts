import { describe, it, expect } from "vitest";
import { buildThemeProposal } from "./propose";
import { allThemes, type UserTheme } from "./taxonomy";
import { FakeProvider } from "../analyst/fake-provider";

describe("taxonomy allThemes merge", () => {
  it("merges built-ins and custom user themes", () => {
    const userThemes: UserTheme[] = [
      {
        code: "custom_theme",
        name: "Custom Theme",
        subthemesJson: JSON.stringify([
          {
            code: "sub_1",
            name: "Sub 1",
            sectorCodes: ["sec_a", "sec_b"]
          }
        ]),
        createdAt: "2026-07-08T00:00:00Z"
      }
    ];
    const list = allThemes(userThemes);
    expect(list.length).toBeGreaterThan(1);
    const custom = list.find((t) => t.code === "custom_theme");
    expect(custom).toBeDefined();
    expect(custom!.name).toBe("Custom Theme");
    expect(custom!.subthemes.length).toBe(1);
    expect(custom!.subthemes[0].name).toBe("Sub 1");
    expect(custom!.subthemes[0].sectorCodes).toEqual(["sec_a", "sec_b"]);
  });
});

describe("buildThemeProposal with FakeProvider", () => {
  it("shapes ThemeProposal payload and preserves evidence provenance", async () => {
    const fakeLlmResponse = JSON.stringify({
      themeName: "NextGen Memory",
      rationale: "High demand for HBM chips is driving growth.",
      subthemeNames: ["High Bandwidth Memory"]
    });
    const provider = new FakeProvider([fakeLlmResponse]);

    const clusters = [
      {
        keywords: ["hbm", "memory"],
        sectorCodes: ["ai_memory"],
        sampleSymbols: ["MU"]
      }
    ];

    const evidence = [
      {
        quote: "Strong demand for HBM3E continues to outstrip supply.",
        symbol: "MU",
        accessionNo: "0001-test"
      }
    ];

    const proposal = await buildThemeProposal(provider, clusters, evidence);

    expect(proposal.proposedName).toBe("NextGen Memory");
    expect(proposal.proposedCode).toBe("nextgen_memory");
    expect(proposal.rationale).toBe("High demand for HBM chips is driving growth.");
    expect(proposal.subthemes.length).toBe(1);
    expect(proposal.subthemes[0].name).toBe("High Bandwidth Memory");
    expect(proposal.subthemes[0].code).toBe("high_bandwidth_memory");
    expect(proposal.subthemes[0].sectorCodes).toEqual(["ai_memory"]);
    expect(proposal.subthemes[0].sampleSymbols).toEqual(["MU"]);
    expect(proposal.evidence).toEqual(evidence);
  });
});
