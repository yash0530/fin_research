import type { Provider, LlmMessage, LlmResult, CompleteOpts } from "./types";
import { ProviderError, ThinkingBudgetExhausted } from "./types";
import type { ProviderProfile } from "../config/providers";

// The live LLM transport. Two protocols (openai_compat + anthropic) over plain
// fetch — no SDKs. `fetchImpl` is injectable so the transport is unit-tested
// without a running llama-server. A non-2xx or network failure becomes a
// ProviderError (connectivity), distinct from a JSON-validation failure.

export type FetchResponse = { ok: boolean; status: number; text: () => Promise<string> };
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<FetchResponse>;

export type HttpProviderOpts = { apiKey?: string; fetchImpl: FetchLike };

export class HttpProvider implements Provider {
  readonly name: string;
  readonly endpointKey: string;
  private readonly profile: ProviderProfile;
  private readonly apiKey?: string;
  private readonly fetchImpl: FetchLike;

  constructor(profile: ProviderProfile, opts: HttpProviderOpts) {
    this.profile = profile;
    this.name = profile.model;
    this.endpointKey = profile.baseUrl; // one in-flight call per endpoint
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl;
  }

  async complete(msg: LlmMessage, opts?: CompleteOpts): Promise<LlmResult> {
    return this.profile.protocol === "anthropic"
      ? this.completeAnthropic(msg, opts)
      : this.completeOpenai(msg, opts);
  }

  private async completeOpenai(msg: LlmMessage, opts?: CompleteOpts): Promise<LlmResult> {
    const url = `${this.profile.baseUrl}/chat/completions`;
    const tokenParam = this.profile.tokenParam ?? "max_tokens";
    const thinking = opts?.thinking;
    const body: Record<string, unknown> = {
      model: this.profile.model,
      messages: [
        { role: "system", content: msg.system },
        { role: "user", content: msg.user },
      ],
      temperature: opts?.temperature ?? 0.6,
      [tokenParam]: opts?.maxTokens ?? this.profile.maxTokens,
    };
    // Thinking contract (live-verified against llama.cpp/Qwen, Jul 2026):
    // - the toggle rides chat_template_kwargs, only where the endpoint accepts it;
    // - grammar/json enforcement is INACTIVE while thinking (llama.cpp #20345),
    //   so response_format is only sent on non-thinking calls — jsonsafe+zod is
    //   the real guarantee either way.
    if (this.profile.supportsThinkingToggle && thinking !== undefined) {
      body.chat_template_kwargs = { enable_thinking: thinking };
    }
    if (this.profile.jsonMode && thinking !== true) body.response_format = { type: "json_object" };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const json = JSON.parse(await this.post(url, headers, body)) as {
      choices?: {
        message?: { content?: string; reasoning_content?: string };
        finish_reason?: string;
      }[];
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = json.choices?.[0];
    const content = choice?.message?.content ?? "";
    const reasoning = choice?.message?.reasoning_content ?? "";
    if (content.trim() === "" && reasoning.length > 0) {
      throw new ThinkingBudgetExhausted(
        `${this.name}: empty content with ${reasoning.length} chars of reasoning ` +
          `(finish_reason=${choice?.finish_reason ?? "?"}) — raise maxTokens or disable thinking`,
      );
    }
    return {
      text: content,
      model: json.model ?? this.profile.model,
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
      reasoningChars: reasoning.length > 0 ? reasoning.length : undefined,
      requestBody: body,
    };
  }

  private async completeAnthropic(msg: LlmMessage, opts?: CompleteOpts): Promise<LlmResult> {
    const url = `${this.profile.baseUrl}/v1/messages`;
    const body: Record<string, unknown> = {
      model: this.profile.model,
      system: msg.system,
      messages: [{ role: "user", content: msg.user }],
      max_tokens: opts?.maxTokens ?? this.profile.maxTokens,
      temperature: opts?.temperature ?? 0.6,
    };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    if (this.apiKey) headers["x-api-key"] = this.apiKey;

    const json = JSON.parse(await this.post(url, headers, body)) as {
      content?: { text?: string }[];
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text: Array.isArray(json.content) ? json.content.map((c) => c.text ?? "").join("") : "",
      model: json.model ?? this.profile.model,
      inputTokens: json.usage?.input_tokens,
      outputTokens: json.usage?.output_tokens,
      requestBody: body,
    };
  }

  private async post(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
  ): Promise<string> {
    let res: FetchResponse;
    try {
      res = await this.fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body) });
    } catch (e) {
      throw new ProviderError(`fetch to ${url} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    const raw = await res.text();
    if (!res.ok) throw new ProviderError(`${this.name} HTTP ${res.status}: ${raw.slice(0, 200)}`);
    return raw;
  }
}
