import type { Provider, LlmMessage, LlmResult, CompleteOpts } from "./types";

/**
 * A scripted LLM for tests. Each `complete()` returns the next script entry
 * (a fixed string, or a function of the incoming message). When scripts run
 * out, the last one repeats. Records every call for assertions.
 *
 * This is what lets us test the multi-agent dossier engine end-to-end with
 * zero network and fully deterministic verdicts.
 */
export type FakeScript = string | ((msg: LlmMessage, callIndex: number) => string);

export class FakeProvider implements Provider {
  readonly name = "fake";
  readonly endpointKey: string;
  private readonly scripts: FakeScript[];
  private idx = 0;
  readonly calls: { msg: LlmMessage; opts?: CompleteOpts }[] = [];

  constructor(scripts: FakeScript[] = [], endpointKey = "fake://local") {
    this.scripts = scripts;
    this.endpointKey = endpointKey;
  }

  async complete(msg: LlmMessage, opts?: CompleteOpts): Promise<LlmResult> {
    this.calls.push({ msg, opts });
    let text = "";
    if (this.scripts.length > 0) {
      const script = this.scripts[Math.min(this.idx, this.scripts.length - 1)];
      text = typeof script === "function" ? script(msg, this.calls.length - 1) : script;
    }
    this.idx += 1;
    return {
      text,
      model: "fake-model",
      inputTokens: Math.ceil((msg.system.length + msg.user.length) / 4),
      outputTokens: Math.ceil(text.length / 4),
    };
  }

  get callCount(): number {
    return this.calls.length;
  }
}
