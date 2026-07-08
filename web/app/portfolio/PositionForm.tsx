"use client";

import { useState, useEffect } from "react";
import { addOrUpdatePositionAction } from "./actions";

interface PositionFormProps {
  initialSymbol?: string;
  initialQty?: number;
  initialAvgCost?: number;
  initialOpenedAt?: string | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const FIELD_LABEL: React.CSSProperties = {
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--fg-muted)",
  fontWeight: 600,
};

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

export default function PositionForm({
  initialSymbol = "",
  initialQty,
  initialAvgCost,
  initialOpenedAt = "",
  onSuccess,
  onCancel,
}: PositionFormProps) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [qty, setQty] = useState(initialQty !== undefined ? String(initialQty) : "");
  const [avgCost, setAvgCost] = useState(initialAvgCost !== undefined ? String(initialAvgCost) : "");
  const [openedAt, setOpenedAt] = useState(initialOpenedAt || new Date().toISOString().slice(0, 10));

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSymbol(initialSymbol);
    setQty(initialQty !== undefined ? String(initialQty) : "");
    setAvgCost(initialAvgCost !== undefined ? String(initialAvgCost) : "");
    setOpenedAt(initialOpenedAt || new Date().toISOString().slice(0, 10));
    setError("");
  }, [initialSymbol, initialQty, initialAvgCost, initialOpenedAt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim()) {
      setError("Symbol is required");
      return;
    }
    const parsedQty = parseFloat(qty);
    const parsedCost = parseFloat(avgCost);

    if (isNaN(parsedQty) || parsedQty <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }
    if (isNaN(parsedCost) || parsedCost <= 0) {
      setError("Average Cost must be greater than 0");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const res = await addOrUpdatePositionAction(symbol.trim().toUpperCase(), parsedQty, parsedCost, openedAt || null);
      if (!res.ok) {
        setError(res.error || "Failed to save position");
      } else {
        if (onSuccess) onSuccess();
        if (!initialSymbol) {
          setSymbol("");
          setQty("");
          setAvgCost("");
          setOpenedAt(new Date().toISOString().slice(0, 10));
        }
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setBusy(false);
    }
  };

  const isEdit = !!initialSymbol;

  return (
    <form onSubmit={handleSubmit} className="flex gap-3" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
      <div style={{ flex: "1", minWidth: "100px" }} className="flex flex-col gap-1">
        <label style={FIELD_LABEL}>Symbol</label>
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="e.g. MU"
          disabled={busy || isEdit}
          style={{ ...FIELD_INPUT, opacity: isEdit ? 0.6 : 1 }}
        />
      </div>

      <div style={{ flex: "1", minWidth: "90px" }} className="flex flex-col gap-1">
        <label style={FIELD_LABEL}>Quantity</label>
        <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 50" disabled={busy} style={FIELD_INPUT} />
      </div>

      <div style={{ flex: "1", minWidth: "90px" }} className="flex flex-col gap-1">
        <label style={FIELD_LABEL}>Avg Cost ($)</label>
        <input type="number" step="any" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} placeholder="e.g. 85.50" disabled={busy} style={FIELD_INPUT} />
      </div>

      <div style={{ flex: "1", minWidth: "110px" }} className="flex flex-col gap-1">
        <label style={FIELD_LABEL}>Opened At</label>
        <input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} disabled={busy} style={FIELD_INPUT} />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="ui-runstatusbar-btn">
          {busy ? "Saving…" : isEdit ? "Update" : "Add Position"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="ui-runstatusbar-btn">
            Cancel
          </button>
        )}
      </div>

      {error && <div className="ui-runstatusbar-err" style={{ width: "100%" }}>{error}</div>}
    </form>
  );
}
