"use client";

import React, { useEffect, useState } from "react";
import { parseAndSaveAction } from "@/app/capture-actions";

export default function CaptureDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    summary?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    const handleToggle = () => {
      setIsOpen((prev) => !prev);
      setResult(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle on 'c' or 'C' key if not focused on inputs/textareas
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setResult(null);
      }
    };

    window.addEventListener("toggle-capture-drawer", handleToggle);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("toggle-capture-drawer", handleToggle);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSave = async () => {
    if (!raw.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await parseAndSaveAction(raw);
      if ("error" in res) {
        setResult({ error: res.error });
      } else {
        setResult({
          success: true,
          summary: res.summary,
        });
        setRaw("");
      }
    } catch (err: any) {
      setResult({ error: err.message ?? "An unexpected error occurred." });
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="capture-drawer">
      <div className="drawer-header">
        <h3 className="drawer-title">
          <svg className="icon-16 drawer-title-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          <span>Pasted-Research Capture</span>
        </h3>
        <button onClick={() => setIsOpen(false)} className="drawer-close">
          <svg className="icon-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="drawer-desc">
        Paste assistant replies containing evidence/theme JSON. The system will parse them and commit them instantly to the database.
      </p>

      <textarea
        placeholder="Paste assistant output here..."
        className="drawer-textarea"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        disabled={busy}
      />

      {result && (
        <div className="drawer-result">
          {result.error ? (
            <div className="drawer-result-error">[Error]: {result.error}</div>
          ) : (
            <div className="drawer-result-ok">[Success]: {result.summary}</div>
          )}
        </div>
      )}

      <div className="drawer-actions">
        <button onClick={handleSave} disabled={busy || !raw.trim()} className="drawer-save">
          {busy ? "Parsing & Saving..." : "Parse & Save"}
        </button>
        <button
          onClick={() => {
            setRaw("");
            setResult(null);
          }}
          disabled={busy || !raw.trim()}
          className="drawer-clear"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
