import type { Provider, LlmMessage, LlmResult, CompleteOpts } from "./types";
import { ProviderError } from "./types";
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
    const body: Record<string, unknown> = {
      model: this.profile.model,
      messages: [
        { role: "system", content: msg.system },
        { role: "user", content: msg.user },
      ],
      temperature: opts?.temperature ?? 0.6,
      [tokenParam]: opts?.maxTokens ?? this.profile.maxTokens,
    };
    if (this.profile.jsonMode) body.response_format = { type: "json_object" };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const json = JSON.parse(await this.post(url, headers, body)) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices?.[0]?.message?.content ?? "",
      model: json.model ?? this.profile.model,
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
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
