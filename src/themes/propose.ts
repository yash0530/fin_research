import { z } from "zod";
import type { Provider } from "../analyst/types";
import { completeJson } from "../analyst/llmjson";

export interface ClusterInput {
  keywords: string[];
  sectorCodes: string[];
  sampleSymbols: string[];
}

export interface EvidenceInput {
  quote: string;
  accessionNo?: string;
  symbol?: string;
}

export const ThemeProposalLlmOutputSchema = z.object({
  themeName: z.string(),
  rationale: z.string(),
  subthemeNames: z.array(z.string()),
});

export async function buildThemeProposal(
  provider: Provider,
  clusters: ClusterInput[],
  evidence: EvidenceInput[]
) {
  if (clusters.length === 0) {
    throw new Error("Cannot propose a theme with zero clusters.");
  }

  const prompt = {
    system:
      "You are an expert investment analyst. You identify emerging macroeconomic or industry themes from recent company catalysts and news evidence. " +
      "Only write fact-based rationales citing the provided evidence. Do not invent new facts. Return JSON matching the schema.",
    user: `We have identified the following clusters of emerging activities:
${clusters
  .map(
    (c, i) =>
      `Cluster [${i}]: Keywords: ${c.keywords.join(", ")}, Sector codes: ${c.sectorCodes.join(", ")}, Symbols: ${c.sampleSymbols.join(", ")}`
  )
  .join("\n")}

Here is the supporting evidence (news/filing quotes):
${evidence
  .map(
    (e, i) =>
      `[Evidence ${i}] (${e.symbol || "unknown"}${
        e.accessionNo ? `, accession: ${e.accessionNo}` : ""
      }): "${e.quote}"`
  )
  .join("\n")}

Please name this overall theme (themeName), provide a concise, fact-based rationale (rationale) drawing ONLY from the provided evidence.
Also, name each cluster as a subtheme (subthemeNames, must be exactly ${
      clusters.length
    } items, in the exact order of the input clusters).
Return JSON matching the schema: {"themeName": string, "rationale": string, "subthemeNames": string[]}.`,
  };

  const response = await completeJson(provider, prompt, ThemeProposalLlmOutputSchema);
  const data = response.data;

  // Derive a clean theme code
  let proposedCode = data.themeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!proposedCode) {
    proposedCode = `proposed_theme_${Date.now()}`;
  }

  const subthemeNames = data.subthemeNames;
  const subthemes = clusters.map((cluster, i) => {
    const name = subthemeNames[i] || `Subtheme ${i + 1}`;
    const code = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return {
      code: code || `${proposedCode}_sub_${i}`,
      name,
      sectorCodes: cluster.sectorCodes,
      sampleSymbols: cluster.sampleSymbols,
    };
  });

  return {
    proposedName: data.themeName,
    proposedCode,
    rationale: data.rationale,
    subthemes,
    evidence,
  };
}
