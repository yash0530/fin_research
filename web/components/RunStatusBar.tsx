"use client";
// Home-page control bar: Refresh digest (boots model) + Refresh data (no model),
// with a live status pill. Buttons disable while any run is in progress.
import { useState } from "react";
import { refreshDigestAction, refreshDataAction } from "@/app/actions";
import type { RunResult } from "@/app/actions";
import { useRunStatus, RunStatusPill } from "@/components/run-ui";

export default function RunStatusBar(): React.JSX.Element {
  const status = useRunStatus();
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = !!status?.busy || pending;

  async function run(action: () => Promise<RunResult>): Promise<void> {
    setErr(null);
    setPending(true);
    try {
      const r = await action();
      if (!r.ok) setErr(r.error ?? "Failed to start.");
    } catch {
      setErr("Failed to start.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-runstatusbar">
      <div className="ui-runstatusbar-actions">
        <button
          disabled={busy}
          onClick={() => run(refreshDigestAction)}
          className="ui-runstatusbar-btn"
        >
          Refresh digest
        </button>
        <button
          disabled={busy}
          onClick={() => run(refreshDataAction)}
          className="ui-runstatusbar-btn"
        >
          Refresh data
        </button>
      </div>
      <div className="flex items-center justify-between">
        <RunStatusPill status={status} />
      </div>
      {err && <p className="ui-runstatusbar-err">{err}</p>}
      <p className="ui-runstatusbar-desc">
        Digest boots local model (~1-2m) for narration, then frees RAM. Data uses no model.
      </p>
    </div>
  );
}
