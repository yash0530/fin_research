// The tool contract. Every tool returns a ToolResult; the `execute` wrapper
// guarantees a tool never throws into the pipeline (a raise becomes a
// low-confidence error result). Ported from finance/analysis/tools/__init__.py.

export type Source = { label: string; url?: string; asOf?: string };
export type Confidence = "high" | "medium" | "low";

export type ToolResult<T = Record<string, unknown>> = {
  tool: string;
  data: T;
  sources: Source[];
  confidence: Confidence;
  cached: boolean;
  error?: string;
  latencyMs?: number;
};

export type ToolOutput<T> = {
  data: T;
  sources?: Source[];
  confidence?: Confidence;
};

export interface Tool<A = Record<string, unknown>, T = Record<string, unknown>> {
  readonly name: string;
  /** One-line description used to build the planner's tool catalog. */
  describe(): string;
  /** May throw — callers use `execute()`, which never throws. */
  run(args: A): Promise<ToolOutput<T>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;

/** Never-throw wrapper: a thrown error becomes a low-confidence error ToolResult. */
export async function execute<A, T>(
  tool: Tool<A, T>,
  args: A,
  now: () => number = Date.now,
): Promise<ToolResult<T>> {
  const started = now();
  try {
    const out = await tool.run(args);
    return {
      tool: tool.name,
      data: out.data,
      sources: out.sources ?? [],
      confidence: out.confidence ?? "medium",
      cached: false,
      latencyMs: now() - started,
    };
  } catch (e) {
    return {
      tool: tool.name,
      data: {} as T,
      sources: [],
      confidence: "low",
      cached: false,
      error: `${tool.name} raised: ${e instanceof Error ? e.message : String(e)}`,
      latencyMs: now() - started,
    };
  }
}

export function isOk(r: ToolResult): boolean {
  return !r.error;
}
