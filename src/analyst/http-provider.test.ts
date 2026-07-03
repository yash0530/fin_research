import { describe, it, expect } from "vitest";
import { z } from "zod";
import { HttpProvider, type FetchLike } from "./http-provider";
import { ProviderError, ThinkingBudgetExhausted } from "./types";
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
    expect(out.thinkingDowngraded).toBe(false);
  });
});

// Thinking contract — live-verified against llama.cpp/Qwen on Jul 2, 2026:
// the toggle rides chat_template_kwargs; grammar enforcement is inactive while
// thinking; an under-budgeted thinking call returns EMPTY content with the whole
// budget in reasoning_content.
describe("HttpProvider thinking contract (openai_compat)", () => {
  const capture = (payload: unknown) => {
    const calls: Record<string, unknown>[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      calls.push(JSON.parse(init.body) as Record<string, unknown>);
      return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
    };
    return { calls, fetchImpl };
  };
  const okPayload = { choices: [{ message: { content: "{}" } }] };

  it("passes enable_thinking through chat_template_kwargs (on and off)", async () => {
    const { calls, fetchImpl } = capture(okPayload);
    const p = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl });
    await p.complete({ system: "s", user: "u" }, { thinking: true });
    await p.complete({ system: "s", user: "u" }, { thinking: false });
    expect(calls[0].chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(calls[1].chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("omits the toggle when thinking is unspecified or unsupported by the profile", async () => {
    const { calls, fetchImpl } = capture(okPayload);
    const qwen = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl });
    await qwen.complete({ system: "s", user: "u" });
    const gemini = new HttpProvider(PROVIDER_PROFILES.gemini_compat, { apiKey: "k", fetchImpl });
    await gemini.complete({ system: "s", user: "u" }, { thinking: true });
    expect(calls[0].chat_template_kwargs).toBeUndefined();
    expect(calls[1].chat_template_kwargs).toBeUndefined(); // cloud endpoints reject unknown params
  });

  it("sends response_format only on non-thinking calls (grammar inactive while thinking)", async () => {
    const { calls, fetchImpl } = capture(okPayload);
    const p = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl });
    await p.complete({ system: "s", user: "u" }, { thinking: true });
    await p.complete({ system: "s", user: "u" }, { thinking: false });
    await p.complete({ system: "s", user: "u" });
    expect(calls[0].response_format).toBeUndefined();
    expect(calls[1].response_format).toEqual({ type: "json_object" });
    expect(calls[2].response_format).toEqual({ type: "json_object" });
  });

  it("throws ThinkingBudgetExhausted (not ProviderError) on empty content + reasoning", async () => {
    const fetchImpl = okFetch({
      choices: [{ message: { content: "", reasoning_content: "step 1... step 2..." }, finish_reason: "length" }],
    });
    const p = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl });
    const err = await p.complete({ system: "s", user: "u" }, { thinking: true }).catch((e) => e);
    expect(err).toBeInstanceOf(ThinkingBudgetExhausted);
    expect(err).not.toBeInstanceOf(ProviderError); // must never trigger connectivity fallback
    expect(String(err.message)).toContain("finish_reason=length");
  });

  it("records reasoningChars when content arrives alongside a thinking trace", async () => {
    const fetchImpl = okFetch({
      choices: [{ message: { content: '{"ok":true}', reasoning_content: "abcd" } }],
    });
    const p = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl });
    const r = await p.complete({ system: "s", user: "u" }, { thinking: true });
    expect(r.text).toBe('{"ok":true}');
    expect(r.reasoningChars).toBe(4);
  });

  it("passes an undici dispatcher honoring profile.timeoutMs (300s default killed live calls)", async () => {
    const seen: unknown[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      seen.push(init.dispatcher);
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: "{}" } }] }) };
    };
    const qwen = new HttpProvider(PROVIDER_PROFILES.qwen_local, { fetchImpl }); // timeoutMs: 900_000
    await qwen.complete({ system: "s", user: "u" });
    await qwen.complete({ system: "s", user: "u" });
    const anthropic = new HttpProvider(PROVIDER_PROFILES.anthropic, { apiKey: "k", fetchImpl }); // no timeoutMs
    await anthropic.complete({ system: "s", user: "u" });
    expect(seen[0]).toBeDefined();
    expect(seen[1]).toBe(seen[0]); // agent is reused, not rebuilt per call
    expect(seen[2]).toBeUndefined(); // profiles without timeoutMs stay on fetch defaults
  });
});

describe("completeJson thinking downgrade", () => {
  const budgetExhausted = () => new ThinkingBudgetExhausted("empty content with 60 chars of reasoning");

  it("degrades to enable_thinking:false once and succeeds, without consuming an attempt", async () => {
    const seen: (boolean | undefined)[] = [];
    const stub = {
      name: "stub",
      endpointKey: "stub",
      async complete(_m: { system: string; user: string }, o?: { thinking?: boolean }) {
        seen.push(o?.thinking);
        if (o?.thinking) throw budgetExhausted();
        return { text: '{"ok":true}', model: "stub" };
      },
    };
    const out = await completeJson(stub, { system: "s", user: "u" }, z.object({ ok: z.boolean() }), {
      thinking: true,
    });
    expect(out.data.ok).toBe(true);
    expect(out.thinkingDowngraded).toBe(true);
    expect(out.attempts).toBe(1); // the downgrade retry did not consume an attempt
    expect(seen).toEqual([true, false]);
  });

  it("rethrows when the call was already non-thinking (no downgrade path)", async () => {
    const stub = {
      name: "stub",
      endpointKey: "stub",
      async complete() {
        throw budgetExhausted();
      },
    };
    await expect(
      completeJson(stub, { system: "s", user: "u" }, z.object({ ok: z.boolean() }), { thinking: false }),
    ).rejects.toBeInstanceOf(ThinkingBudgetExhausted);
  });
});
