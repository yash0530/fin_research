"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createJournalEntryAction } from "./actions";

const ACTIONS = ["BUY", "HOLD", "TRIM", "AVOID", "SELL", "NOTE"];

const FIELD_INPUT: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "var(--panel-radius)",
  border: "1px solid var(--border-dim)",
  background: "var(--bg-app)",
  color: "var(--fg-primary)",
  fontSize: "13px",
  width: "100%",
  outline: "none",
  fontFamily: "var(--font-sans)",
};

export function JournalEditor({ initialSymbol = "" }: { initialSymbol?: string }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(initialSymbol);
  const [action, setAction] = useState("NOTE");
  const [thesis, setThesis] = useState("");
  const [invalidation, setInvalidation] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await createJournalEntryAction(symbol, action, thesis, invalidation);
      if (res.ok) {
        setMsg({ ok: true, text: "Entry logged and DecisionSnapshot frozen." });
        setThesis("");
        setInvalidation("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error || "Failed to save" });
      }
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || "Failed to save" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="flex flex-col gap-1" style={{ flex: 1 }}>
          <label className="ui-stat-label">Symbol</label>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. MU" style={FIELD_INPUT} disabled={busy} />
        </div>
        <div className="flex flex-col gap-1" style={{ flex: 1 }}>
          <label className="ui-stat-label">Action</label>
          <select value={action} onChange={(e) => setAction(e.target.value)} style={FIELD_INPUT} disabled={busy}>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="ui-stat-label">Thesis</label>
        <textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          rows={3}
          className="font-mono"
          style={{ ...FIELD_INPUT, resize: "vertical" }}
          placeholder="Why this action, today?"
          disabled={busy}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="ui-stat-label">Invalidation (optional)</label>
        <textarea
          value={invalidation}
          onChange={(e) => setInvalidation(e.target.value)}
          rows={2}
          className="font-mono"
          style={{ ...FIELD_INPUT, resize: "vertical" }}
          placeholder="What would prove this wrong?"
          disabled={busy}
        />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="ui-runstatusbar-btn">
          {busy ? "Logging…" : "Log Entry"}
        </button>
        {msg && <span className={msg.ok ? "ui-trend ui-trend--positive" : "ui-runstatusbar-err"}>{msg.text}</span>}
      </div>
    </form>
  );
}
