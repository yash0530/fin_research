# deploy/ — deployment artifacts

The platform is **on-demand only** — there is no always-on daemon and no
always-resident model. Work runs when the user clicks a button in the web UI (or runs
`npm run job -- <name> --manage-llama`), which boots llama-server for that run and
kills it on completion (see `src/analyst/llama-lifecycle.ts` + `src/jobs/run-lock.ts`).

- `uninstall-launchd.sh` — removes ALL prior automation: boots out + deletes the
  scheduler agent (`com.engine.scheduler`), boots out + disables the always-resident
  model agent (`com.local.llamacpp` → `.plist.bak`), and kills any lingering
  scheduler/llama processes. Idempotent. Run once when migrating off the old
  self-running deployment:

  ```bash
  bash deploy/uninstall-launchd.sh
  ```

## History (removed)

Earlier the platform ran itself via two launchd agents: `com.engine.scheduler`
(the 60s tick loop in `scripts/scheduler.ts` — overnight chain + auto-seeded dossier
campaign) and `com.local.llamacpp` (`KeepAlive` kept the 27B model in RAM forever, with
the scheduler watchdog restarting it). Both were retired in the move to on-demand runs.
The llama launch args they used now live, version-controlled, in `src/config/llama.ts`.
`scripts/scheduler.ts` is retained for reference but is **deprecated / not installed**.
