# v2-7 — LLM-assisted theme-creation sandbox (human-gated)

Goal: the deep model scans recent MD&A / business text across the universe, clusters recurring emerging exposures, and PROPOSES a new theme (code/name/subthemes/sectorCodes). A human reviews and Accepts (→ becomes a live theme) or Rejects. **Invariant #5: the engine proposes, a human applies** — never auto-activate a theme.

Read first: `src/themes/taxonomy.ts` (themes are CONFIG — `Theme`/`Subtheme` shape; a live theme is a `THEMES` entry), `src/themes/CLAUDE.md`, `src/runs/runner.ts` (research-run step pattern + how a run wraps LLM work; add a run type), `src/analyst/llmjson.ts` (`completeJson` + zod), `prisma/migrations/CLAUDE.md` (additive migration, next number **0012** after v2-5's 0011 — coordinate: if 0011 not yet merged, use 0012 and note the dependency). Conventions: `src/config/settings.ts` (deep vs fast role routing — theme proposal = deep/memo role).

## Build

1. Migration `0012_theme_proposals.sql` + schema: `ThemeProposal(id TEXT PK, status TEXT CHECK IN ('PENDING','ACCEPTED','REJECTED'), proposedName TEXT, proposedCode TEXT, rationale TEXT, subthemesJson TEXT /*[{name, sectorCodes[], sampleSymbols[]}]*/, evidenceJson TEXT /*quotes+accessionNos*/, createdAt TEXT, decidedAt TEXT)`; and `UserTheme(code TEXT PK, name TEXT, subthemesJson TEXT, createdAt TEXT)` — the store of human-ACCEPTED themes. Additive.
2. `src/themes/taxonomy.ts`: make `THEMES` the built-ins, add `allThemes(userThemes: UserTheme[])` that merges built-ins + accepted user themes into one list. Every reader that lists themes goes through this (keep back-compat: `THEMES` still exported).
3. `src/themes/propose.ts` — pure `buildThemeProposal(clusters, evidence)`: given deterministic inputs (per-sector recent-catalyst/keyword clusters + sample symbols), shape the `ThemeProposal` payload. The LLM ONLY labels/names the cluster + writes rationale from provided evidence (provenance-linked) — it invents no memberships. Pure shaping is fixture-tested; the LLM naming is injected (FakeProvider).
4. Research-run type `theme_proposal` in `src/runs/runner.ts`: gather recent `Catalyst`/`NewsItem`/8-K `FilingEvent` keyword clusters across sectors (deterministic), call `completeJson` (deep/memo role) to name + rationalize the top cluster, persist a `ThemeProposal` (status PENDING), and write it into the run artifact. Budget-scaled cluster count. Never-crash.
5. `src/runs/create.ts` / CLI: allow creating a `theme_proposal` run (`research_create --type=theme_proposal --target=all --budget-min=30`).
6. Web: `web/lib/theme-proposals-data.ts` reader + a **Sandbox** panel on `/themes` listing PENDING proposals with rationale + evidence quotes + Accept/Reject buttons → server action `web/app/themes/proposal-actions.ts` that on Accept writes a `UserTheme` (and marks proposal ACCEPTED) and on Reject marks REJECTED. Reuse `web/components/ui/` primitives; NO Tailwind classes; real EmptyState ("No proposals — launch a theme-proposal research run"). The themes tree/index now renders built-ins + accepted user themes via `allThemes`.

## Tests & docs
Fixture tests: `propose.test.ts` (cluster→proposal shaping, LLM-naming via FakeProvider, evidence provenance preserved), taxonomy `allThemes` merge, runner `theme_proposal` step (fake clock/LLM/db). New `web/lib/theme-proposals-data.ts` + note; update `src/themes/CLAUDE.md`, `src/runs/CLAUDE.md`, `web/lib/CLAUDE.md`, `web/app/themes/CLAUDE.md`, `prisma/migrations/CLAUDE.md`, `prisma/CLAUDE.md`.

## Gates (fix until green)
`npm run typecheck` · `npm test` · `npm run check:claude` · `cd web && npm run build`. Append `## Result`. Do NOT commit. Do NOT apply the migration to data/engine.db. Touch only: src/themes/{taxonomy,propose}*, src/runs/{runner,create}*, scripts/job.ts (if needed for the CLI type), web/lib/theme-proposals-data.ts, web/app/themes/**, web/app/globals.css, prisma/*, affected CLAUDE.md.
