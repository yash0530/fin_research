# web/app/journal/ — decision journal + calibration console

`/journal` per the target IA: entry log, editor, post-trade outcomes, mistake
taxonomy, quarterly review board, and the governor/calibration console (moved
here from the old `/calibration` page, which now redirects here).

## Files

- `page.tsx` — server (`.journal-grid`, 5fr/7fr). Left (`.journal-sidebar-log`):
  **Quarterly Review Board** — entries from `listJournalEntriesWithSnapshots()`
  (`@/lib/journal-data`) grouped by `YYYY-Qn`, newest quarter open by default,
  each entry showing its **frozen `DecisionSnapshot` payload** in a `Disclosure`
  (rendered as-is — never recomputed against live prices) — and the **Mistake
  Taxonomy** board (`mistakeTaxonomy()`: entries whose nearest-prior `RecCall`
  resolved `thesisFalsified=true`, bucketed by action — a mechanical
  cross-reference, no LLM judgment). Right (`.journal-editor-canvas`): the
  `JournalEditor` (new entries only — history is immutable, a correction is a
  new entry), **Post-Trade Outcome cards** (resolved `RecCall` rows via
  `listRecCalls()`, 1m/3m/6m/1y `TrendNumber`s + thesis-falsified badge), and
  the **Calibration/Governor Console** (per-tier cap-status table via
  `tierSummary()` + the full recommendation log in a `Disclosure`, restyled
  from the old `/calibration` page with `DenseTable`/`Badge` primitives —
  dossier links now point at `/tickers/[symbol]#consensus` since `/dossiers`
  was deleted).
- `?symbol=` query param scopes the entry log + pre-fills the editor (linked
  from `/portfolio`'s per-position journal column).
- `JournalEditor.tsx` — client create-only form; on submit writes a
  `JournalEntry` + a matching `DecisionSnapshot` (paired by exact `createdAt`,
  same convention as `tickers/[symbol]/actions.ts`'s inversion checklist and
  the buy ceremony's commit action).
- `actions.ts` — `createJournalEntryAction` (server; snapshots the current
  close price into the frozen payload, never mutates a past entry).

## Invariants

- Historical entries render their frozen snapshot; the journal never displays
  a past entry's data recomputed against today's price.
- Mistake taxonomy is a mechanical join (`JournalEntry` × `RecCall`), not an
  LLM classification.
