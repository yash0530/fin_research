"use client";

import React, { useState } from "react";
import { launchResearchRunAction } from "../app/tickers/[symbol]/actions";

interface Props {
  symbol: string;
}

export function ResearchRunDrawer({ symbol }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [runType, setRunType] = useState("dossier");
  const [budgetMinutes, setBudgetMinutes] = useState(30);
  const [profile, setProfile] = useState("default");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleLaunch = async () => {
    setLoading(true);
    setStatusText(null);
    try {
      const budgetSeconds = budgetMinutes * 60;
      const res = await launchResearchRunAction(symbol, runType, budgetSeconds, profile);
      if (res.ok) {
        setStatusText({
          type: "success",
          text: `Background Research Run ${res.runId} launched! Inspect output logs via agy cli or refresh digest.`,
        });
      } else {
        setStatusText({ type: "error", text: res.error || "Failed to trigger research run" });
      }
    } catch (err: any) {
      setStatusText({ type: "error", text: err.message || "An error occurred launching the run" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="drawer-save"
        style={{
          width: "100%",
          padding: "10px",
          fontWeight: 700,
          background: "var(--accent-blue)",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          borderRadius: "var(--panel-radius)",
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        <span style={{ fontSize: "14px" }}>⚙</span>
        <span>Launch Research Run</span>
      </button>

      {isOpen && (
        <div className="capture-drawer" style={{ display: "flex" }}>
          <div className="drawer-header">
            <h3 className="drawer-title">
              <span className="drawer-title-icon">⚙</span>
              <span>Launch Agentic Run for {symbol}</span>
            </h3>
            <button onClick={() => setIsOpen(false)} className="drawer-close" aria-label="Close drawer">
              ✖
            </button>
          </div>

          <p className="drawer-desc">
            Spawn a detached multi-agent debate and research run. The job executes asynchronously in the background.
          </p>

          <div className="flex flex-col gap-4" style={{ flex: 1 }}>
            {/* Run Type */}
            <div className="flex flex-col gap-1">
              <label className="ui-stat-label">Run Type</label>
              <select
                value={runType}
                onChange={(e) => setRunType(e.target.value)}
                className="ticker-jump-input"
                style={{ width: "100%", height: "36px", background: "var(--bg-app)" }}
              >
                <option value="dossier">Dossier (Full consensus synthesis & debate)</option>
                <option value="quick-scan">Quick Scan (Rapid technicals & filings digest)</option>
                <option value="screener">Screener Backfill (Re-evaluate scoring metrics)</option>
              </select>
            </div>

            {/* Budget minutes */}
            <div className="flex flex-col gap-1">
              <label className="ui-stat-label">Time Budget (Minutes)</label>
              <select
                value={budgetMinutes}
                onChange={(e) => setBudgetMinutes(Number(e.target.value))}
                className="ticker-jump-input"
                style={{ width: "100%", height: "36px", background: "var(--bg-app)" }}
              >
                <option value={10}>10 Minutes (Quick, light model usage)</option>
                <option value={20}>20 Minutes (Standard details scan)</option>
                <option value={30}>30 Minutes (Thorough research search)</option>
                <option value={40}>40 Minutes (Maximum depth agentic debate)</option>
              </select>
            </div>

            {/* Profile */}
            <div className="flex flex-col gap-1">
              <label className="ui-stat-label">Model Reasoning Profile</label>
              <select
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                className="ticker-jump-input"
                style={{ width: "100%", height: "36px", background: "var(--bg-app)" }}
              >
                <option value="default">Default Balanced Profile</option>
                <option value="aggressive">Aggressive (Maximum model steps)</option>
                <option value="conservative">Conservative (Strict budget containment)</option>
              </select>
            </div>

            {statusText && (
              <div
                className="drawer-result"
                style={{
                  fontSize: "12px",
                  lineHeight: 1.4,
                  padding: "10px",
                  borderRadius: "var(--panel-radius)",
                  border: "1px solid",
                  background: statusText.type === "success" ? "var(--green-bg)" : "var(--red-bg)",
                  borderColor: statusText.type === "success" ? "var(--green-border)" : "var(--red-border)",
                  color: statusText.type === "success" ? "var(--green-text)" : "var(--red-text)",
                }}
              >
                {statusText.text}
              </div>
            )}
          </div>

          <div className="drawer-actions">
            <button disabled={loading} onClick={handleLaunch} className="drawer-save" style={{ flex: 2 }}>
              {loading ? "Triggering..." : "Execute Run Process"}
            </button>
            <button onClick={() => setIsOpen(false)} className="drawer-clear" style={{ flex: 1 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
