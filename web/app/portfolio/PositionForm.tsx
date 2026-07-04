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

  // Sync state if initial props change (e.g. when selecting a different row to edit)
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
      const res = await addOrUpdatePositionAction(
        symbol.trim().toUpperCase(),
        parsedQty,
        parsedCost,
        openedAt || null
      );
      if (!res.ok) {
        setError(res.error || "Failed to save position");
      } else {
        if (onSuccess) onSuccess();
        // Reset if we are adding a new position
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
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
      <div style={{ flex: "1", minWidth: "120px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>Symbol</label>
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="e.g. MU"
          disabled={busy || isEdit}
          style={{
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--line)",
            background: "var(--inset)",
            color: "var(--ink)",
            fontSize: "14px",
            width: "100%",
            outline: "none",
            fontFamily: "var(--fbody)",
            opacity: isEdit ? 0.6 : 1,
          }}
        />
      </div>

      <div style={{ flex: "1", minWidth: "100px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>Quantity</label>
        <input
          type="number"
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="e.g. 50"
          disabled={busy}
          style={{
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--line)",
            background: "var(--inset)",
            color: "var(--ink)",
            fontSize: "14px",
            width: "100%",
            outline: "none",
            fontFamily: "var(--fbody)",
          }}
        />
      </div>

      <div style={{ flex: "1", minWidth: "100px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>Avg Cost ($)</label>
        <input
          type="number"
          step="any"
          value={avgCost}
          onChange={(e) => setAvgCost(e.target.value)}
          placeholder="e.g. 85.50"
          disabled={busy}
          style={{
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--line)",
            background: "var(--inset)",
            color: "var(--ink)",
            fontSize: "14px",
            width: "100%",
            outline: "none",
            fontFamily: "var(--fbody)",
          }}
        />
      </div>

      <div style={{ flex: "1", minWidth: "120px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>Opened At</label>
        <input
          type="date"
          value={openedAt}
          onChange={(e) => setOpenedAt(e.target.value)}
          disabled={busy}
          style={{
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--line)",
            background: "var(--inset)",
            color: "var(--ink)",
            fontSize: "14px",
            width: "100%",
            outline: "none",
            fontFamily: "var(--fbody)",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="submit"
          className="verdict-badge buy"
          disabled={busy}
          style={{
            border: "none",
            cursor: "pointer",
            padding: "10px 20px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            marginTop: 0,
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          {busy ? "Saving..." : isEdit ? "Update" : "Add Position"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="verdict-badge avoid"
            style={{
              border: "none",
              cursor: "pointer",
              padding: "10px 20px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              marginTop: 0,
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {error && (
        <div style={{ width: "100%", color: "var(--neg)", fontSize: "13px", marginTop: "0.5rem", fontWeight: 500 }}>
          {error}
        </div>
      )}
    </form>
  );
}
