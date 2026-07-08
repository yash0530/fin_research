# web/app/themes/ — theme intelligence pages

- `page.tsx` — index; redirects to the first configured theme (`/themes/ai`).
- `[code]/` — the theme page (see its CLAUDE.md).

Data comes from `web/lib/themes-data.ts`, which delegates all scoring to the
tested `@engine/themes` modules — the page renders, it never computes.
