import { describe, it, expect } from "vitest";
import { jsonsafe, jsonsafeArray } from "./jsonsafe";

describe("jsonsafe", () => {
  it("parses strict JSON", () => {
    expect(jsonsafe('{"a":1}')).toEqual({ a: 1 });
  });

  it("salvages JSON wrapped in prose", () => {
    expect(jsonsafe('Here is the result: {"verdict":"BUY"} — hope that helps'))
      .toEqual({ verdict: "BUY" });
  });

  it("salvages JSON wrapped in code fences", () => {
    expect(jsonsafe('```json\n{"conviction":"HIGH"}\n```'))
      .toEqual({ conviction: "HIGH" });
  });

  it("handles nested braces via last-brace heuristic", () => {
    expect(jsonsafe('noise {"a":{"b":2}} tail')).toEqual({ a: { b: 2 } });
  });

  it("returns null when no object is recoverable", () => {
    expect(jsonsafe("no json here")).toBeNull();
    expect(jsonsafe("")).toBeNull();
  });

  it("salvages a top-level array", () => {
    expect(jsonsafeArray('output: [1,2,3]')).toEqual([1, 2, 3]);
    expect(jsonsafeArray("nope")).toBeNull();
  });
});
