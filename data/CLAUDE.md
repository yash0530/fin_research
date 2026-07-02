# data/ — runtime data (gitignored contents)

Holds the local SQLite database and logs at runtime. Everything here except this
`CLAUDE.md` is gitignored (`data/*.db`, `data/*.db-*`).

- `engine.db` — the SQLite database, created/updated by `scripts/apply-migration.ts`
  (WAL mode). Not committed; regenerate with `tsx scripts/apply-migration.ts`.

Never commit the database or its WAL/SHM sidecars.
