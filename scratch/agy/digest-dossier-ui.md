# agy batch — Morning-read home page + dossier UI (web/)

## Intent
Make `/` the daily morning read over the REAL Digest rows, and give dossiers a
queue/detail UI over the real store. Read-only pages; follow the existing
`web/lib/live.ts` SQLite-read pattern and the story components' design language
(`web/components/story/story.css` custom properties — reuse its palette classes,
don't duplicate the palette).

## Ground rules
- Work ONLY inside web/ (+ append ## Result to this file). NEVER touch repo root.
- Data shapes: read (do not import) root `src/research/synthesize.ts` for the Digest
  dataJson shape ({asOf, headline, insights:[{family,severity,text,evidence}],counts})
  and `src/db/sqlite-store.ts` for the `_dossier_state` row shape; mirror minimal
  types in `web/lib/` like story-types does.
- RecCall rows live in the `RecCall` table (verdict summary fields: action,
  conviction, judgeSizePct, governedSizePct, governorReason, priceAtCall).
- Never render "(no data)" walls — every empty state says what will fill it and
  which command produces it (e.g. `npm run job -- overnight`).

## Deliverables
1. `web/lib/digest-data.ts` — latestDigest(), digestByDate(d), listDigests(30).
   `web/lib/dossier-data.ts` — listDossiers(), dossierById(id) (parsed state incl.
   stages/verdict/recCall), recCallForDossier(id).
2. `/` (rewrite `web/app/page.tsx`): the morning read — asOf + headline hero;
   insights grouped by family with severity chips (critical/warn/info colors from
   story.css palette); provenance string per insight in a muted mono line;
   links: /dossiers, /story, /screener, /capture, /buylist. Digest-history strip
   (last 7 asOf dates → /digest/[d]).
3. `web/app/digest/[d]/page.tsx` — a past digest, same rendering.
4. `/dossiers` (upgrade): table of real dossiers — symbol, status chip, verdict
   (recommendation + conviction), governed size, started/finished, wall-clock;
   row → detail.
5. `web/app/dossiers/[id]/page.tsx` — detail: stage timeline (name + elapsed,
   done/running/pending states), verdict card (recommendation, conviction, targets,
   stop, position size judge→governed with governor reason, what_would_change_mind
   list), debate accordion (bull thesis_md / bear attack+independent / rebuttal /
   critique notes — render markdown with a minimal renderer or <pre> if no dep;
   do NOT add heavy markdown deps), evidence table (tool, confidence, data_status).
6. CLAUDE.md updates for touched dirs.

## Gates
`cd web && npm run build` green. No `any`, no ESLint suppressions.

## Wrap-up
Append `## Result`: files, build status, screenshots-worthy notes. Do NOT commit.

## Result
- **Files Modified/Created**:
  - `web/app/page.tsx` — Morning Read dashboard with families/severity styling and history strip.
  - `web/app/digest/[d]/page.tsx` — Past digest dynamic date route.
  - `web/app/dossiers/page.tsx` — Real dossiers queue table with status, verdict, governed size, start/finish times, and wall clock.
  - `web/app/dossiers/[id]/page.tsx` — Dossier detail page featuring stage timeline, verdict comparison, debate accordion (bull, bear, rebuttal, critique), and tool evidence table.
  - `web/app/digest/CLAUDE.md` — Dynamic route parent CLAUDE.md.
  - `web/app/digest/[d]/CLAUDE.md` — Dynamic date route CLAUDE.md.
  - `web/app/dossiers/[id]/CLAUDE.md` — Dynamic detail route CLAUDE.md.
  - `web/CLAUDE.md` and `web/app/CLAUDE.md` — Updated directory layout lists.
- **Build Status**:
  - `cd web && npm run build` compiles, typechecks, and generates static pages perfectly (green).
  - Root `npm run verify` runs typechecking, all 316 unit/integration tests, and 47-directory CLAUDE.md verification (all green).
- **Screenshots-Worthy Notes**:
  - Styled entirely with editorial palettes and typography defined in `story.css`.
  - Accordion panels implemented natively via HTML `<details>` and `<summary>` for lightweight, zero-dependency client-side interactivity.
  - Clean error states showing helpful CLI command tips instead of empty screens.

