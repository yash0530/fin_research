# deploy/ — deployment artifacts

- `com.engine.scheduler.plist` — launchd agent for the scheduler daemon
  (`scripts/scheduler.ts`). RunAtLoad + KeepAlive; logs to `data/logs/`. Install by
  copying to `~/Library/LaunchAgents/` and `launchctl bootstrap`. Adjust paths to your
  checkout.

The daemon's schedule DECISIONS are the tested `src/schedule/wake` module;
`scripts/scheduler.ts --once` runs a single decision tick (verifiable). The long-lived
loop + wiring the overnight chain / dossier-queue drain to live jobs is runtime.
