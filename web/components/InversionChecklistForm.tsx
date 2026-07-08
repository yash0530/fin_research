"use client";

import React, { useState } from "react";
import { submitChecklistAction } from "../app/tickers/[symbol]/actions";
import { Panel } from "./ui/Panel";

interface Props {
  symbol: string;
  payload: any; // Computed cockpit payload to freeze
}

export function InversionChecklistForm({ symbol, payload }: Props) {
  const [action, setAction] = useState<string>("HOLD");
  const [thesis, setThesis] = useState("");
  const [invalidation, setInvalidation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thesis.trim()) {
      setMessage({ type: "error", text: "Investment thesis is required" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await submitChecklistAction(symbol, action, thesis, invalidation, payload);
      if (res.ok) {
        setMessage({ type: "success", text: "Thesis checklist recorded and state snapshot frozen successfully." });
        setThesis("");
        setInvalidation("");
      } else {
        setMessage({ type: "error", text: res.error || "Failed to record checklist" });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An unexpected error occurred" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <h3 className="story-h2 section-heading mb-4">
        Inversion Checklist & Journal
      </h3>

      {message && (
        <div
          className={`font-sans checklist-message ${message.type === "success" ? "checklist-message--ok" : "checklist-message--error"}`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Action picker */}
        <div className="flex flex-col gap-1">
          <label className="ui-stat-label">Inversion Action Plan</label>
          <div className="ui-rangetabs w-fit">
            {["BUY", "HOLD", "TRIM", "AVOID"].map((act) => (
              <button
                key={act}
                type="button"
                onClick={() => setAction(act)}
                className={`ui-rangetabs-btn ${action === act ? "ui-rangetabs-btn--active" : "ui-rangetabs-btn--inactive"}`}
              >
                {act}
              </button>
            ))}
          </div>
        </div>

        {/* Thesis Input */}
        <div className="flex flex-col gap-1">
          <label className="ui-stat-label">Core Investment Thesis (Underlying Drivers)</label>
          <textarea
            value={thesis}
            onChange={(e) => setThesis(e.target.value)}
            rows={3}
            placeholder="Why own this asset? Detail GICS/AI structural tailwinds and metrics..."
            className="font-mono field-textarea"
          />
        </div>

        {/* Invalidation input */}
        <div className="flex flex-col gap-1">
          <label className="ui-stat-label">Disconfirming Invalidation Checklist (What kills the thesis?)</label>
          <textarea
            value={invalidation}
            onChange={(e) => setInvalidation(e.target.value)}
            rows={3}
            placeholder="Write down structural factors or tripwires that prove this thesis wrong (e.g. capex cut, revenue deceleration)..."
            className="font-mono field-textarea"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="drawer-save drawer-save--inline"
        >
          {loading ? "Recording..." : "Record Inversion checklist & freeze state"}
        </button>
      </form>
    </div>
  );
}
