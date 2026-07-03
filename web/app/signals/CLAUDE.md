# web/app/signals/ — tripwire signal history

Read-only `RuleEvent` list grouped by day, severity chips (critical/warn/info from
story.css palette). Data via `web/lib/signals-data.ts`. Empty state names the
producing job (`npm run job -- rules`). Acknowledging a signal is CLI/backlog.
