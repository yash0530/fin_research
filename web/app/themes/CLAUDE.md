# web/app/themes/ — theme intelligence pages

- `page.tsx` — index; redirects to the first configured theme (`/themes/ai`).
- `[code]/` — the theme page (see its CLAUDE.md).
- `proposal-actions.ts` — Server Actions to Accept or Reject pending theme proposals.
- `ThemeProposalsSandbox.tsx` — client component interactive sandbox panel listing proposals.

Data comes from `web/lib/themes-data.ts` and `web/lib/theme-proposals-data.ts` — the pages render, they never compute.
