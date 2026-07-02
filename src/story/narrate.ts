import { z } from "zod";
import { completeJson } from "../analyst/llmjson";
import type { Provider } from "../analyst/types";
import type { StoryPageData } from "./schema";

// Optional narration layer for a story page. The page renders fully WITHOUT this
// (deterministic-first); narration only adds prose over already-true facts and
// invents nothing. Thinking OFF (narration role). Driven by any Provider — so it's
// FakeProvider-tested here; the live Qwen call is the only blocked part.

export const NarrativeSchema = z.object({
  hero_md: z.string(),
  sections: z.record(z.string()).default({}),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

export async function narrateStory(provider: Provider, data: StoryPageData): Promise<Narrative> {
  const system =
    "You write concise, honest editorial prose for an investment research story page. " +
    "Narrate ONLY the already-computed facts you are given — invent no numbers. STRICT JSON only.";
  const stats = data.statTape.map((s) => `${s.label}: ${s.value}`).join("; ");
  const user =
    `TICKER: ${data.symbol} — ${data.title}\n` +
    `Verdict: ${data.hero.verdict} / ${data.hero.conviction}\n` +
    `Thesis: ${data.hero.thesis}\n` +
    `Cycle stage: ${data.cycleStrip.stage}\n` +
    `Key stats: ${stats}\n` +
    `Callouts: ${data.callouts.join(" | ")}\n\n` +
    `Return {"hero_md": "<2-3 sentence hero paragraph>", "sections": {"<section>": "<md>"}}.`;
  const out = await completeJson(provider, { system, user }, NarrativeSchema, { thinking: false });
  return out.data;
}
