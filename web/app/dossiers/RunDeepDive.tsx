"use client";
// Dossiers-page control: type 1+ tickers → boot the model → run the multi-agent
// debate → free the RAM. Live status pill; input/button disable while a run is going.
import { useState } from "react";
import { runDeepDiveAction } from "@/app/dossiers/actions";
import { useRunStatus, RunStatusPill, runButtonStyle } from "@/components/run-ui";

export default function RunDeepDive(): React.JSX.Element {
  const status = useRunStatus();
  const [symbols, setSymbols] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = !!status?.busy || pending;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      const r = await runDeepDiveAction(symbols);
      if (!r.ok) setErr(r.error ?? "Failed to start.");
      else setSymbols("");
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
        padding: "1.25rem 1.5rem",
        margin: "1.25rem 0",
        maxWidth: 640,
      }}
    >
      <form onSubmit={submit} style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={symbols}
          onChange={(e) => setSymbols(e.target.value.toUpperCase())}
          placeholder="NVDA  (or NVDA,AMD,ASML)"
          disabled={busy}
          aria-label="Ticker(s) to deep-dive"
          style={{
            flex: "1 1 200px",
            minWidth: 180,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            background: "var(--inset)",
            color: "var(--ink)",
            fontFamily: "var(--fmono, monospace)",
            fontSize: 14,
          }}
        />
        <button type="submit" disabled={busy || !symbols.trim()} style={runButtonStyle(busy || !symbols.trim())}>
          Run deep-dive
        </button>
      </form>
      <div style={{ marginTop: "0.75rem" }}>
        <RunStatusPill status={status} />
      </div>
      {err && <p style={{ color: "var(--avoid, #c00)", fontSize: 13, margin: "0.5rem 0 0" }}>{err}</p>}
      <p className="body muted" style={{ fontSize: 12, margin: "0.5rem 0 0" }}>
        Boots the local model (~1–2 min), runs the planner→bull→bear→judge debate, then frees the RAM. One boot covers a comma-separated batch.
      </p>
    </div>
  );
}
