// Single source of truth for the LOCAL llama-server (Qwen 3.6 27B) — both the
// endpoint the provider posts to AND the command that boots it.
//
// History: the endpoint (`localhost:8000`) was hardcoded in three places
// (providers.ts, scripts/scheduler.ts, http-provider.test.ts) and the launch args
// lived ONLY in a launchd plist (`com.local.llamacpp`). The on-demand lifecycle
// (boot-on-click, kill-when-done) needs to spawn the server itself, so the launch
// command lives here now — one place, all env-overridable.

// URL host (what clients dial) vs bind host (what the server listens on). They
// differ on purpose: the server binds loopback `127.0.0.1` (as the plist did), while
// clients dial `localhost` (resolves to loopback and matches the existing config/tests).
const URL_HOST = process.env.LLAMA_HOST ?? "localhost";
const BIND_HOST = process.env.LLAMA_BIND_HOST ?? "127.0.0.1";
const PORT = Number(process.env.LLAMA_PORT ?? "8000");

export const LLAMA_HOST = URL_HOST;
export const LLAMA_PORT = PORT;

/** OpenAI-compat base the HttpProvider posts to (`…/chat/completions`). */
export const LLAMA_BASE_URL = `http://${URL_HOST}:${PORT}/v1`;
/** llama.cpp health endpoint — returns 200 once the model is loaded and serving. */
export const LLAMA_HEALTH_URL = `http://${URL_HOST}:${PORT}/health`;

/** llama-server binary + model GGUF, overridable for a different box/model. */
const LLAMA_BIN = process.env.LLAMA_BIN ?? "/opt/homebrew/bin/llama-server";
const LLAMA_MODEL =
  process.env.LLAMA_MODEL ?? "/Users/yash/Models/qwen3.6-27b-mtp-q8/Qwen3.6-27B-Q8_0.gguf";

/**
 * The exact argv to boot the model, ported verbatim from the retired
 * `com.local.llamacpp` launchd plist: MTP speculative draft, flash-attention, 64K
 * context, ONE in-flight request (`-np 1`, matches the single-flight lock), thinking
 * template ON. Host/port come from the env-tunable constants above.
 */
export function llamaLaunchArgv(): string[] {
  return [
    LLAMA_BIN,
    "-m", LLAMA_MODEL,
    "--host", BIND_HOST,
    "--port", String(PORT),
    "-ngl", "99",
    "-c", "65536",
    "-fa", "on",
    "-np", "1",
    "--spec-type", "draft-mtp",
    "--spec-draft-n-max", "6",
    "--metrics",
    "--alias", "qwen3.6-27b",
    "--jinja",
    "--chat-template-kwargs", '{"enable_thinking": true}',
  ];
}

/** How long to wait for /health after spawn before giving up (a cold 27B Q8 load
 *  off disk with `-ngl 99` can take a couple of minutes). */
export const LLAMA_BOOT_TIMEOUT_MS = Number(process.env.LLAMA_BOOT_TIMEOUT_MS ?? "300000");

/** Grace period after SIGTERM before escalating to SIGKILL on teardown. */
export const LLAMA_STOP_GRACE_MS = Number(process.env.LLAMA_STOP_GRACE_MS ?? "10000");
