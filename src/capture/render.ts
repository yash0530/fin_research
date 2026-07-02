import { OUTPUT_FORMAT } from "./parse";

// Renders the prompt the user copies into an external model. Injects local ENGINE
// data (watchlist, sector, ticker) and always appends the strict OUTPUT_FORMAT so
// the answer parses cleanly on the way back.

export type PromptTemplate = "daily_scan" | "theme_deep_dive" | "ticker_check" | "discovery_sweep";

export type RenderContext = {
  asOf: string;
  watchlist?: string[];
  sector?: { code: string; label: string };
  ticker?: string;
  focus?: string;
};

export function renderPrompt(template: PromptTemplate, ctx: RenderContext): string {
  const header = `As of ${ctx.asOf}. You are a buy-side research assistant. Be specific, cite sources, no hype.`;
  let body: string;
  switch (template) {
    case "daily_scan":
      body = `Scan for material, dated developments across this watchlist: ${(ctx.watchlist ?? []).join(", ") || "(none)"}. Surface risks, catalysts, and any thesis-changing news in the last 72h.`;
      break;
    case "theme_deep_dive":
      body = `Deep dive on the theme "${ctx.sector?.label ?? ctx.focus ?? "unspecified"}" (${ctx.sector?.code ?? ""}). Supply/demand, key players, capex signals, and second-order beneficiaries. Flag emerging names for discovery.`;
      break;
    case "ticker_check":
      body = `Focused check on ${ctx.ticker ?? "the ticker"}${ctx.focus ? ` — specifically: ${ctx.focus}` : ""}. Bull points, bear points, near-term catalysts, and what would change the thesis.`;
      break;
    case "discovery_sweep":
      body = `Find under-covered names exposed to ${ctx.focus ?? ctx.sector?.label ?? "AI infrastructure"} that are NOT in this list: ${(ctx.watchlist ?? []).join(", ") || "(none)"}. For each, one line on why it matters.`;
      break;
    default:
      body = "Summarize the most material developments.";
  }
  return `${header}\n\n${body}\n\n${OUTPUT_FORMAT}`;
}
