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
    <form onSubmit={handleSubmit} className="flex gap-3 flex-wrap items-end">
      <div className="flex flex-col gap-1 flex-1 min-w-100">
        <label className="field-label">Symbol</label>
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="e.g. MU"
          disabled={busy || isEdit}
          className={`field-input ${isEdit ? "field-input--faded" : ""}`}
        />
      </div>

      <div className="flex flex-col gap-1 flex-1 min-w-90">
        <label className="field-label">Quantity</label>
        <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 50" disabled={busy} className="field-input" />
      </div>

      <div className="flex flex-col gap-1 flex-1 min-w-90">
        <label className="field-label">Avg Cost ($)</label>
        <input type="number" step="any" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} placeholder="e.g. 85.50" disabled={busy} className="field-input" />
      </div>

      <div className="flex flex-col gap-1 flex-1 min-w-110">
        <label className="field-label">Opened At</label>
        <input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} disabled={busy} className="field-input" />
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

      {error && <div className="ui-runstatusbar-err w-full">{error}</div>}
    </form>
  );
}
