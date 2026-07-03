# web/app/dossiers/[id]/ — Dossier detail page (dynamic)

`page.tsx` loads a single dossier debate state from the SQLite DB by ID via `lib/dossier-data.ts`.

It renders:
1. **Stage Timeline**: Status (done/running/pending) and elapsed timing for each stage.
2. **Investment Verdict**: Recommendation (BUY/HOLD/TRIM/AVOID), conviction, target range, stop price, and sizing calibration (suggested vs governed with rationale).
3. **Debate Accordion**: Collapsible `<details>` panels for Bull Thesis, Bear Thesis (independent + targeted attack), Rebuttal, and Critique/Revision notes.
4. **Evidence Ledger**: Table of tool calls with confidence levels and data status.

Server component. `force-dynamic` + `nodejs` runtime so the SQLite reader works.
