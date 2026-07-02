import type { ToolResult } from "./types";
import { isOk } from "./types";

/**
 * Accumulates tool outputs for one research subject. `evidencePrompt` renders a
 * capped, deterministic view for agent prompts; `citableTools` is the namespace
 * the evidence-validator checks claims against ("no naked numbers").
 */
export class EvidenceLedger {
  readonly symbol: string;
  private readonly results: ToolResult[] = [];

  constructor(symbol: string) {
    this.symbol = symbol.toUpperCase().trim();
  }

  add(r: ToolResult): void {
    this.results.push(r);
  }

  all(): readonly ToolResult[] {
    return this.results;
  }

  okResults(): ToolResult[] {
    return this.results.filter(isOk);
  }

  latestByTool(tool: string): ToolResult | undefined {
    for (let i = this.results.length - 1; i >= 0; i--) {
      if (this.results[i].tool === tool) return this.results[i];
    }
    return undefined;
  }

  /** Sorted, unique names of tools that returned OK — the citable namespace. */
  citableTools(): string[] {
    return [...new Set(this.okResults().map((r) => r.tool))].sort();
  }

  /** Compact, per-tool-capped rendering for agent prompts. */
  evidencePrompt(maxCharsPerTool = 1200): string {
    const blocks: string[] = [];
    for (const r of this.okResults()) {
      const body = JSON.stringify(r.data);
      const capped =
        body.length > maxCharsPerTool ? `${body.slice(0, maxCharsPerTool)}…(truncated)` : body;
      const src = r.sources.map((s) => s.label).join(", ") || "(no source)";
      blocks.push(`[${r.tool}] (confidence: ${r.confidence})\n${capped}\nsources: ${src}`);
    }
    return blocks.join("\n\n");
  }

  size(): number {
    return this.results.length;
  }
}
