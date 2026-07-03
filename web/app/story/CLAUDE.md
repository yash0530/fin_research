# web/app/story/ — Story pages

Parent of the dynamic `[id]` route. The flagship editorial page per dossier.

- `page.tsx` — **archive index**: lists all `StoryPage` rows from the DB (newest first)
  plus a permanent link to `/story/demo`. Uses `listStoryPages()` from `lib/story-data.ts`.
  Server component, `force-dynamic` + `nodejs` runtime.
- `[id]/page.tsx` — **editorial page**: full Micron-reference-style story assembly.
  See `[id]/CLAUDE.md` for the component breakdown.
