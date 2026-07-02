// Shared rate limiter (slot-reservation model). Guarantees grants are spaced at
// least `1000/ratePerSec` ms apart, so N callers hammering it in parallel can
// never exceed the rate. One instance is shared by ALL EDGAR callers to honour
// the 8 req/s etiquette. Pure/synchronous core (reserve) → deterministically
// testable; `throttle` is the async convenience wrapper.

export class RateLimiter {
  private nextFreeAt: number;
  readonly intervalMs: number;
  private readonly now: () => number;

  constructor(ratePerSec: number, now: () => number = Date.now) {
    if (ratePerSec <= 0) throw new Error("ratePerSec must be > 0");
    this.intervalMs = 1000 / ratePerSec;
    this.now = now;
    this.nextFreeAt = now();
  }

  /** Reserve the next slot; returns the ms to wait before proceeding (0 = now). */
  reserve(atMs: number = this.now()): number {
    const grantAt = Math.max(atMs, this.nextFreeAt);
    this.nextFreeAt = grantAt + this.intervalMs;
    return grantAt - atMs;
  }

  /** Await a slot, then run `fn`. Serialises callers to the configured rate. */
  async throttle<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void> = defaultSleep): Promise<T> {
    const wait = this.reserve();
    if (wait > 0) await sleep(wait);
    return fn();
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
