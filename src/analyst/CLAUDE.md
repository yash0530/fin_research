# src/analyst/ — LLM plumbing

The single path every LLM call in the engine takes. Designed so an unbenchmarked local
model (Qwen 3.6 27B) can drive a 9–12 call debate without crashing the pipeline.

## Files

- `types.ts` — `Provider` interface (`complete(msg, opts)`), `LlmMessage`, `LlmResult`, `ProviderError`. `endpointKey` is the lock key.
- `jsonsafe.ts` — salvage JSON from prose/fenced output; `null` if hopeless. The backstop for weak-model formatting.
- `fake-provider.ts` — `FakeProvider`: scripted responses + call recording. Drives every engine test deterministically.
- `llmjson.ts` — `completeJson(provider, msg, schema, opts)`: jsonsafe → `zod.safeParse` → **retry with the validation error appended**. Throws `LlmJsonError` (carrying the last raw output) after `maxAttempts`.
- `singleflight.ts` — `withLlmLock(endpointKey, fn)`: promise-chain mutex **keyed by endpoint**. One llama-server = one call at a time (`-np 1`); a second local model on another port runs concurrently.
- `http-provider.ts` — `HttpProvider`: the live transport for both protocols (openai_compat + anthropic) over plain `fetch`. `fetchImpl` is injectable → unit-tested with no server; non-2xx/network failure → `ProviderError` (connectivity, distinct from a validation failure).

## Invariants

- `completeJson` is the ONLY way agents get structured output — never hand-roll `JSON.parse`.
- Wrap real provider calls in `withLlmLock(provider.endpointKey, …)`.
- Validation failures **retry** (prompt/model issue); connectivity failures are a separate concern (fallback lives in the runner, connectivity-only).

## Tests

`jsonsafe.test.ts` (6) · `llmjson.test.ts` (5, incl. retry-then-succeed and terminal failure) · `singleflight.test.ts` (3, incl. concurrency across endpoints + rejection isolation).
