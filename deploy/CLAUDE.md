# deploy/ — deployment artifacts

launchd wiring that turns the scheduler daemon into a self-running service.

- `com.engine.scheduler.plist` — the launchd agent for `scripts/scheduler.ts`.
  `RunAtLoad` + `KeepAlive` keep it alive across logins/crashes; stdout →
  `data/logs/scheduler.log`, stderr → `data/logs/scheduler.err.log`. `WorkingDirectory`
  and log paths are pinned to this checkout — edit them if you move the repo.
- `install-launchd.sh` — idempotent installer: copies the plist into
  `~/Library/LaunchAgents`, `launchctl bootout`s any existing instance, `bootstrap`s
  the `gui/$(id -u)` domain, `kickstart`s it, and prints status. Re-run any time.
  Uninstall: `launchctl bootout gui/$(id -u)/com.engine.scheduler && rm ~/Library/LaunchAgents/com.engine.scheduler.plist`.

The daemon's schedule DECISIONS are the tested `src/schedule/{wake,watchdog,tick}`
modules; `scripts/scheduler.ts --once` runs a single READ-ONLY decision pass (verifiable,
no side effects). The long-lived loop wires the overnight chain + daily backup +
dossier-queue drain to the LIVE jobs via the shared `src/jobs/registry-live` (the same
code path as the `npm run job` CLI), and probes/restarts the llama-server each tick.

## CEO install (one command)

```bash
bash deploy/install-launchd.sh
```
