"use client";
// Home-page control bar: Refresh digest (boots model) + Refresh data (no model),
// with a live status pill. Buttons disable while any run is in progress.
import { useState } from "react";
import { refreshDigestAction, refreshDataAction } from "@/app/actions";
import type { RunResult } from "@/app/actions";
import { useRunStatus, RunStatusPill, runButtonStyle } from "@/components/run-ui";

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
    <div
      className="panel"
      style={{
        border: "1px solid var(--line)",
        background: "var(--surface)",
        borderRadius: 12,
        padding: "1rem 1.25rem",
        margin: "1.25rem 0",
      }}
    >
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => run(refreshDigestAction)} style={runButtonStyle(busy)}>
          Refresh digest
        </button>
        <button disabled={busy} onClick={() => run(refreshDataAction)} style={runButtonStyle(busy)}>
          Refresh data
        </button>
        <RunStatusPill status={status} />
      </div>
      {err && <p style={{ color: "var(--avoid, #c00)", fontSize: 13, margin: "0.5rem 0 0" }}>{err}</p>}
      <p className="body muted" style={{ fontSize: 12, margin: "0.5rem 0 0" }}>
        Refresh digest boots the local model (~1–2 min) for narration, then frees the RAM. Refresh data uses no model.
      </p>
    </div>
  );
}
