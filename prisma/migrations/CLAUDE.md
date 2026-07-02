# prisma/migrations/ — additive SQL migrations

Hand-written, additive SQL applied via `scripts/apply-migration.ts` (matching the
ENGINE convention — we do NOT run `prisma migrate dev` against the live SQLite file).

- `0001_init.sql` — the baseline schema (generated from `schema.prisma` via
  `prisma migrate diff --from-empty --script`; 30 tables).

New migrations are numbered and additive (ALTER/CREATE only); never destructive without
an explicit backup step first.
