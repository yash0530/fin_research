# web/app/digest/[d]/ — Past digest page (dynamic)

`page.tsx` loads a past morning digest row from the SQLite DB by date (`d` column) via `lib/digest-data.ts`.

Identical to the home page Morning Read, it groups insights by family and displays severity badges, provenance strings, a navigation links strip, and a last-7-digest history strip.

Server component. `force-dynamic` + `nodejs` runtime so the SQLite reader works.
