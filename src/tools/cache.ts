import { createHash } from "node:crypto";
import type { ToolResult } from "./types";

/** Deterministic stringify — key is independent of object key ordering. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** `tool:sha1(args)` — matches the ToolCacheEntry key scheme in the schema. */
export function cacheKey(tool: string, args: unknown): string {
  const h = createHash("sha1").update(stableStringify(args)).digest("hex");
  return `${tool}:${h}`;
}

export class ToolCache {
  private readonly store = new Map<string, { result: ToolResult; expiresAt: number }>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  get(key: string): ToolResult | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (this.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return { ...hit.result, cached: true };
  }

  set(key: string, result: ToolResult, ttlMs: number): void {
    this.store.set(key, { result, expiresAt: this.now() + ttlMs });
  }

  size(): number {
    return this.store.size;
  }
}
