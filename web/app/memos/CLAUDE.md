# web/app/memos/ — living-memo review (a human-gated write path)

- `page.tsx` — index: active memos + a "awaiting first review" queue (staged-only symbols).
- `[symbol]/page.tsx` — per-ticker: staged deltas (with Apply/Reject), the active 10-section
  memo, and version history. Reads via `web/lib/memo-data.ts`.
- `MemoReview.tsx` — client Apply/Reject buttons.
- `actions.ts` — server actions over `@engine/dossier/memo-store` (applyMemoVersion /
  rejectMemoVersion). The engine proposes (staging happens at dossier completion); a
  human applies here. Writes go through `lib/engine-write.openWritableDb`.
