import type { AnyTool, Tool } from "./types";

/**
 * Explicit tool registry. The dossier planner reads `promptCatalog()` to know
 * what it can call. Instance-based (not global) so tests register fakes freely.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  register(tool: AnyTool): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  registerAll(tools: AnyTool[]): this {
    for (const t of tools) this.register(t);
    return this;
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  all(): AnyTool[] {
    return [...this.tools.values()];
  }

  names(): string[] {
    return [...this.tools.keys()].sort();
  }

  /** The catalog string injected into the planner prompt. */
  promptCatalog(): string {
    return this.all()
      .map((t: Tool) => `- ${t.name}: ${t.describe()}`)
      .join("\n");
  }
}
