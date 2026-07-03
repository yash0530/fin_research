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

## tick.ts

The per-tick logic, wired to the REAL DB but with the heavy work (overnight chain,
dossier drain) INJECTED so it's testable with fakes and no network.

- `evaluateCatchUp(db, now, window?)` — read-only decision: reads the latest `Digest`
  date (`loadLatestDigest`) and asks `shouldCatchUp` whether we owe today's morning
  digest. Returns `{ marketDate, lastDigestDate, due }`. This is exactly what
  `scripts/scheduler.ts --once` calls (no side effects).
- `schedulerTick({ db, runChain, drainDossier, now?, window?, log? })` — one live tick:
  when `due`, run the overnight chain (+ daily backup); otherwise (idle) drain the
  dossier queue. Exactly one of chain/drain fires per tick, so the morning digest always
  lands before dossiers. The live loop + mutex + wake detection + llama watchdog live in
  `scripts/scheduler.ts`; the LIVE chain/drain come from `src/jobs/registry-live`.

## Tests

`wake.test.ts` — wake detection, same-date guard, catch-up window logic.
`watchdog.test.ts` — healthy no-op, first-kick, cooloff hold, post-cooloff retry.
`tick.test.ts` — `evaluateCatchUp` (no digest ⇒ due, today's digest ⇒ short-circuit,
yesterday ⇒ due, outside window ⇒ not due) and `schedulerTick` against a fixture DB
(no-digest triggers the injected chain fn; today's-digest short-circuits the chain and
takes the idle drain fn).
