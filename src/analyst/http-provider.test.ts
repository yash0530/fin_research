import { describe, it, expect } from "vitest";
import { z } from "zod";
import { HttpProvider, type FetchLike } from "./http-provider";
import { ProviderError } from "./types";
import { completeJson } from "./llmjson";
import { PROVIDER_PROFILES } from "../config/providers";

const okFetch = (payload: unknown): FetchLike => async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(payload),
});

describe("HttpProvider (openai_compat)", () => {
  it("parses content, model, and usage", async () => {
    const fetchImpl = okFetch({
      choices: [{ message: { content: '{"ok":true}' } }],
      model: "qwen3.6-27b",
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const p = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl });
    const r = await p.complete({ system: "s", user: "u" });
    expect(r.text).toBe('{"ok":true}');
    expect(r.model).toBe("qwen3.6-27b");
    expect(r.inputTokens).toBe(10);
    expect(p.endpointKey).toBe("http://localhost:8000/v1");
  });

  it("sends request body with the model + messages (audit trail)", async () => {
    let captured = "";
    const fetchImpl: FetchLike = async (_url, init) => {
      captured = init.body;
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: "{}" } }] }) };
    };
    const p = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl });
    await p.complete({ system: "sys-x", user: "usr-y" });
    expect(captured).toContain("qwen3.6-27b");
    expect(captured).toContain("sys-x");
    expect(captured).toContain("usr-y");
  });

  it("throws ProviderError on a non-2xx response", async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 500, text: async () => "boom" });
    const p = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl });
    await expect(p.complete({ system: "s", user: "u" })).rejects.toBeInstanceOf(ProviderError);
  });

  it("throws ProviderError when fetch itself rejects (server down)", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    const p = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl });
    await expect(p.complete({ system: "s", user: "u" })).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe("HttpProvider (anthropic)", () => {
  it("parses the content blocks + usage", async () => {
    const fetchImpl = okFetch({
      content: [{ text: "hello " }, { text: "world" }],
      model: "claude-haiku-4-5",
      usage: { input_tokens: 7, output_tokens: 3 },
    });
    const p = new HttpProvider(PROVIDER_PROFILES.anthropic, { apiKey: "sk-test", fetchImpl });
    const r = await p.complete({ system: "s", user: "u" });
    expect(r.text).toBe("hello world");
    expect(r.outputTokens).toBe(3);
  });
});

describe("HttpProvider end-to-end through completeJson", () => {
  it("feeds real transport output into the JSON harness", async () => {
    const fetchImpl = okFetch({ choices: [{ message: { content: 'result: {"verdict":"BUY"}' } }] });
    const p = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl });
    const out = await completeJson(p, { system: "s", user: "u" }, z.object({ verdict: z.string() }));
    expect(out.data.verdict).toBe("BUY");
  });
});
