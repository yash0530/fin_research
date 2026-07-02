// Per-endpoint single-flight lock.
//
// One llama-server serves one request at a time (MTP requires `-np 1`), so all
// calls to a given endpoint must serialize. But a *second* local server (e.g. a
// Gemma model on another port) can run concurrently — so the lock is keyed by
// endpoint, NOT a single global mutex. This is the seam that keeps the tiered
// "small work -> small model, main work -> Qwen" plan a config change later.

const chains = new Map<string, Promise<unknown>>();

/**
 * Run `fn` after all prior work queued on `endpointKey` completes. A failure in
 * one queued call never breaks the chain for the next (the tail swallows the
 * result). Returns `fn`'s own promise (which may reject to the caller).
 */
export function withLlmLock<T>(endpointKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(endpointKey) ?? Promise.resolve();
  const run = prev.then(
    () => fn(),
    () => fn(),
  );
  // Store a settled-swallowing tail so a rejection doesn't poison the queue.
  chains.set(
    endpointKey,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/** How many endpoints currently have a queue (for diagnostics/tests). */
export function activeEndpointCount(): number {
  return chains.size;
}

/** Test helper: clear all queues. */
export function _resetLocks(): void {
  chains.clear();
}
