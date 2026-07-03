# web/app/memos/[symbol]/ — per-ticker Living Memo

Renders (via `web/lib/memo-data.memoVersionsFor`): staged deltas with Apply/Reject
(`../MemoReview` → `../actions`), the active 10-section memo, and superseded/rejected
history. `params` is async (Next 15). Empty state points at the dossier CLI.
