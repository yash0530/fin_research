# web/app/live/ — Live digest route

`page.tsx` (force-dynamic, nodejs runtime) reads the **live SQLite digest** at request
time via `web/lib/live.ts` → the tested `@engine/db/queries.loadLatestDigest`. Falls back
to a "run npm run seed" message when no DB is present. This is the pattern for wiring the
remaining pages to live Prisma/SQLite reads; `next build` compiles it (dynamic route).
