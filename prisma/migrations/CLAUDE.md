# prisma/migrations/ — additive SQL migrations

Hand-written, additive SQL applied via `scripts/apply-migration.ts` (matching the
ENGINE convention — we do NOT run `prisma migrate dev` against the live SQLite file).

- `0001_init.sql` — the baseline schema (generated from `schema.prisma` via
  `prisma migrate diff --from-empty --script`; 30 tables).
- `0002_rule_event.sql` — the `RuleEvent` table (mirrors the runtime guard in
  `src/db/queries.ts`; applying it where the guard already ran is a no-op).
- `0003_dossier_state.sql` — the durable `_dossier_state` table used by
  `src/db/sqlite-store.ts` (JSON blob per dossier → resume across restarts). Like
  `_migrations`, it is an INTERNAL underscore-prefixed table, so it is intentionally
  NOT a `schema.prisma` model (Prisma cannot own an underscore table). `CREATE IF NOT
  EXISTS`, so applying it where the store already ran is a no-op.

New migrations are numbered and additive (ALTER/CREATE only); never destructive without
an explicit backup step first.
