# src/schedule/ — scheduler decision logic

The daemon (6am `node-cron` + wake detection) is runtime, but its DECISIONS are pure and
tested here.

## wake.ts

- `detectedWake(lastTickMs, nowMs, threshold=180s)` — a long inter-tick gap ⇒ the machine slept.
- `hasTodaysDigest(lastDigestMarketDate, todayMarketDate)` — the same-market-date guard.
- `shouldCatchUp({ hour, lastDigestMarketDate, todayMarketDate, window })` — run the
  overnight chain now iff there's no digest for today's market date AND we're in the
  morning window (default 05:00–14:00). This backs both auto-catch-up and the manual
  "Run morning" trigger.

The auto sleep-gap wake-detector daemon itself is deferred (per the locked plan); the
6am cron + manual trigger ship first. This module is the reusable decision core.

## watchdog.ts

`shouldKickstart({ healthOk, lastKickMs, nowMs, cooloff=5min })` — restart the
llama-server launchd service iff it's down and we're past the cooloff. Born from the
Jul 2 incident (server dead AND unloaded despite KeepAlive:true). The runtime probe +
`launchctl bootstrap`+`kickstart` live in `scripts/scheduler.ts`; the decision is pure.

## Tests

`wake.test.ts` — wake detection, same-date guard, catch-up window logic.
`watchdog.test.ts` — healthy no-op, first-kick, cooloff hold, post-cooloff retry.
