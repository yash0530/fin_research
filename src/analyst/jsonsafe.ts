// Weak local models wrap JSON in prose or code fences; this absorbs it.
// Ported verbatim from ResearchEngine/lib/analyst/jsonsafe.ts (behaviour preserved).

/**
 * Parse strict JSON; else the substring between the first '{' and last '}'.
 * Returns null if no JSON object can be recovered.
 */
export function jsonsafe(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    // fall through to brace-substring salvage
  }
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}

/** Same idea for a top-level JSON array (some agents return lists). */
export function jsonsafeArray(text: string): unknown[] | null {
  const direct = jsonsafe(text);
  if (Array.isArray(direct)) return direct;
  const a = text.indexOf("[");
  const b = text.lastIndexOf("]");
  if (a === -1 || b <= a) return null;
  try {
    const parsed = JSON.parse(text.slice(a, b + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
