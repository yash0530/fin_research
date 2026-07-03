# web/app/journal/ — trade journal

Read-only `JournalEntry` list (symbol → cockpit, action, thesis, invalidation, date),
newest-first. Data via `web/lib/journal-data.ts`. Entries come from logged buy-list
executions and manual notes; writing is CLI/backlog.
