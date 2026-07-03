"use client";

// Staged-delta review controls (apply / reject). The engine gates memo changes on a
// human — these two buttons are that gate. Optimistic-free: await the action, then
// the server revalidates the page.

import { useState } from "react";
import { applyMemoAction, rejectMemoAction } from "./actions";

export default function MemoReview({ versionId, symbol }: { versionId: number; symbol: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "apply" | "reject") => {
    setBusy(true);
    setError(null);
    const r = kind === "apply" ? await applyMemoAction(versionId, symbol) : await rejectMemoAction(versionId, symbol);
    setBusy(false);
    if ("error" in r) setError(r.error);
    else setDone(kind === "apply" ? "Applied ✓" : "Rejected");
  };

  if (done) return <span className="muted">{done}</span>;
  return (
    <span className="memo-review">
      <button disabled={busy} onClick={() => run("apply")}>
        Apply
      </button>
      <button className="ghost" disabled={busy} onClick={() => run("reject")}>
        Reject
      </button>
      {error && <span className="chip chip-critical">{error}</span>}
    </span>
  );
}
