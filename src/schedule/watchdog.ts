// llama-server watchdog decision logic (pure). Jul 2 incident: the server was
// found dead AND unloaded from launchd despite KeepAlive:true (cause unknown,
// memory was fine). The daemon therefore probes /health each tick and restarts
// the service when it's down — with a cooloff so a genuinely broken server
// doesn't get hammered with restarts every 60s.

export type WatchdogDecision = {
  healthOk: boolean;
  /** ms timestamp of the last restart we issued; 0 = never. */
  lastKickMs: number;
  nowMs: number;
  /** Min gap between restart attempts. Default 5 min. */
  cooloffMs?: number;
};

/** Restart iff the server is down and we haven't just tried. */
export function shouldKickstart(d: WatchdogDecision): boolean {
  if (d.healthOk) return false;
  const cooloff = d.cooloffMs ?? 300_000;
  return d.nowMs - d.lastKickMs >= cooloff;
}
