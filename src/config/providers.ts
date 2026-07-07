// LLM provider profiles. Two protocols cover the ecosystem:
//   - "anthropic":     POST {baseUrl}/v1/messages
//   - "openai_compat": POST {baseUrl}/chat/completions
// Adding a provider = adding a profile here + a key in .env. Never a code change.
//
// The local qwen_local endpoint is single-sourced from ./llama.ts (which also owns
// the on-demand launch command), so the URL is defined in exactly one place.

import { LLAMA_BASE_URL } from "./llama";
//
// NEW vs. ResearchEngine: every profile declares `contextWindow` and
// `thinkingMode`. The dossier context-budget guard reads `contextWindow` from
// the ACTIVE profile instead of a hardcoded 64K, so swapping Qwen for another
// local model (different context, no MTP) stays a config change.

export type ProviderProfile = {
  protocol: "anthropic" | "openai_compat";
  baseUrl: string;
  model: string;
  /** Env var holding the API key; null for keyless local servers. */
  apiKeyEnv: string | null;
  maxTokens: number;
  /** Max input context in tokens — the dossier budget guard reads this. */
  contextWindow: number;
  /** Does the model expose a reasoning trace we toggle per call? */
  thinkingMode: "on" | "off" | "configurable";
  /**
   * Endpoint accepts `chat_template_kwargs: { enable_thinking }` (llama.cpp
   * serving Qwen-style templates). Cloud OpenAI-compat endpoints (e.g. Gemini)
   * reject unknown params — leave unset for them.
   */
  supportsThinkingToggle?: boolean;
  tokenParam?: "max_tokens" | "max_completion_tokens";
  /** Ask for response_format json_object (helps small local models). */
  jsonMode?: boolean;
  timeoutMs?: number;
};

export const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
  // ── PRIMARY: local Qwen 3.6 27B (Q8_0 MTP GGUF) via llama-server ──────────
  // One call in flight at a time (`-np 1`); 64K context.
  qwen_local: {
    protocol: "openai_compat",
    baseUrl: LLAMA_BASE_URL,
    model: "qwen3.6-27b",
    apiKeyEnv: null,
    maxTokens: 8192,
    contextWindow: 64_000,
    thinkingMode: "configurable", // ON for reasoning agents, OFF for narration
    supportsThinkingToggle: true,
    jsonMode: true,
    timeoutMs: 900_000,
  },

  // ── FUTURE: a second local model for cheap/structured work. Documented and
  // wired, but unused until you point a role's override at it (config/settings.ts).
  // NOTE: 64 GB can't hold two Q8 models resident — run this at a smaller quant
  // on its own port, or swap on demand. The per-endpoint lock already supports it.
  gemma4_local: {
    protocol: "openai_compat",
    baseUrl: "http://localhost:8001/v1",
    model: "gemma-4-27b",
    apiKeyEnv: null,
    maxTokens: 4096,
    contextWindow: 128_000,
    thinkingMode: "off",
    supportsThinkingToggle: true,
    jsonMode: true,
    timeoutMs: 600_000,
  },

  // ── CONNECTIVITY-ONLY fallback (server down). Not a quality crutch: runner
  // only falls back here on a ProviderError, never on a validation failure.
  gemini_compat: {
    protocol: "openai_compat",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.1-flash-lite",
    apiKeyEnv: "GEMINI_API_KEY",
    maxTokens: 4096,
    contextWindow: 1_000_000,
    thinkingMode: "off",
    jsonMode: true,
  },

  anthropic: {
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-haiku-4-5",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    maxTokens: 1500,
    contextWindow: 200_000,
    thinkingMode: "off",
  },

  anthropic_strong: {
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-6",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    maxTokens: 2500,
    contextWindow: 200_000,
    thinkingMode: "configurable",
  },
};

export function getProfile(name: string): ProviderProfile | undefined {
  return PROVIDER_PROFILES[name];
}
