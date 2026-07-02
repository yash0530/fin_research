// The provider abstraction. A `Provider` is a live LLM endpoint; `ProviderProfile`
// (config/providers.ts) is its static description. All LLM traffic in the engine
// flows through `Provider.complete` — real HTTP providers and the test FakeProvider
// share this shape so the dossier engine can be driven deterministically in tests.

export type LlmMessage = {
  system: string;
  user: string;
};

export type CompleteOpts = {
  /** Reasoning/thinking trace: ON for debate agents, OFF for narration. */
  thinking?: boolean;
  temperature?: number;
  maxTokens?: number;
};

export type LlmResult = {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** The exact request payload — the audit trail is a feature. */
  requestBody?: unknown;
};

export interface Provider {
  readonly name: string;
  /**
   * The single-flight lock key. One llama-server runs one call at a time
   * (MTP requires `-np 1`), so all calls to the same endpoint serialize on
   * this key; different endpoints (e.g. a future Gemma server) run concurrently.
   */
  readonly endpointKey: string;
  complete(msg: LlmMessage, opts?: CompleteOpts): Promise<LlmResult>;
}

/** Raised on connectivity/HTTP failure (server down) — distinct from a validation failure. */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}
