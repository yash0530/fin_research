// Scheduler decision logic (pure). The daemon (cron + launchd) is runtime, but
// the DECISIONS — "did we just wake from sleep?", "should we catch up now?",
// "do we already have today's digest?" — are pure and tested here.

/** A gap between ticks longer than the threshold means the machine slept. */
export function detectedWake(lastTickMs: number, nowMs: number, thresholdMs = 180_000): boolean {
  return nowMs - lastTickMs > thresholdMs;
}

/** Same-market-date guard: true if a digest already exists for today's market date. */
export function hasTodaysDigest(lastDigestMarketDate: string | null, todayMarketDate: string): boolean {
  return lastDigestMarketDate === todayMarketDate;
}

export type CatchUpOpts = {
  hour: number; // local hour 0..23
  lastDigestMarketDate: string | null;
  todayMarketDate: string;
  windowStartHour?: number; // default 5am
  windowEndHour?: number; // default 2pm
};

/**
 * Catch up (run the overnight chain now) if we have NO digest for today's market
 * date AND the local time is within the morning window. This is what a wake or a
 * manual "Run morning" trigger consults.
 */
export function shouldCatchUp(opts: CatchUpOpts): boolean {
  const startH = opts.windowStartHour ?? 5;
  const endH = opts.windowEndHour ?? 14;
  if (hasTodaysDigest(opts.lastDigestMarketDate, opts.todayMarketDate)) return false;
  return opts.hour >= startH && opts.hour <= endH;
}
