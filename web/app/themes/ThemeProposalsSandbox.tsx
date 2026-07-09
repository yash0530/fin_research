"use client";

import React, { useState, useTransition } from "react";
import type { ThemeProposalRow } from "@/lib/theme-proposals-data";
import { handleAcceptProposal, handleRejectProposal } from "./proposal-actions";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";

interface Props {
  proposals: ThemeProposalRow[];
}

export function ThemeProposalsSandbox({ proposals }: Props) {
  const [isPending, startTransition] = useTransition();
  const [statusMap, setStatusMap] = useState<Record<string, "accepting" | "rejecting" | "done" | null>>({});

  const handleAction = (id: string, type: "accept" | "reject") => {
    setStatusMap((prev) => ({ ...prev, [id]: type === "accept" ? "accepting" : "rejecting" }));
    startTransition(async () => {
      try {
        const res = type === "accept" ? await handleAcceptProposal(id) : await handleRejectProposal(id);
        if (res.success) {
          setStatusMap((prev) => ({ ...prev, [id]: "done" }));
        } else {
          setStatusMap((prev) => ({ ...prev, [id]: null }));
          alert(`Failed to ${type} proposal.`);
        }
      } catch (e) {
        setStatusMap((prev) => ({ ...prev, [id]: null }));
        alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  };

  const activeProposals = proposals.filter((p) => statusMap[p.id] !== "done");

  if (activeProposals.length === 0) {
    return (
      <EmptyState
        title="No proposals"
        body="No proposals pending review. Launch a theme-proposal research run to generate a new theme."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {activeProposals.map((p) => {
        let subthemes: any[] = [];
        try {
          subthemes = JSON.parse(p.subthemesJson);
        } catch {}
        let evidence: any[] = [];
        try {
          evidence = JSON.parse(p.evidenceJson);
        } catch {}

        const state = statusMap[p.id];

        return (
          <Panel key={p.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", margin: "0 0 4px 0" }}>
                  {p.proposedName} <span className="meta-dim">({p.proposedCode})</span>
                </h3>
                <span className="meta-dim">Proposed: {new Date(p.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  disabled={isPending || !!state}
                  onClick={() => handleAction(p.id, "accept")}
                  className="ui-runstatusbar-btn"
                  style={{
                    backgroundColor: "var(--green-bg)",
                    border: "1px solid var(--green-border)",
                    color: "var(--green-text)",
                    cursor: "pointer",
                    padding: "4px 12px",
                    borderRadius: "4px"
                  }}
                >
                  {state === "accepting" ? "Accepting..." : "Accept"}
                </button>
                <button
                  disabled={isPending || !!state}
                  onClick={() => handleAction(p.id, "reject")}
                  className="ui-runstatusbar-btn"
                  style={{
                    backgroundColor: "var(--red-bg)",
                    border: "1px solid var(--red-border)",
                    color: "var(--red-text)",
                    cursor: "pointer",
                    padding: "4px 12px",
                    borderRadius: "4px"
                  }}
                >
                  {state === "rejecting" ? "Rejecting..." : "Reject"}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <strong className="text-table-header" style={{ display: "block", marginBottom: "4px" }}>Rationale</strong>
              <p style={{ color: "var(--fg-secondary)", margin: 0, fontSize: "0.875rem" }}>{p.rationale}</p>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <strong className="text-table-header" style={{ display: "block", marginBottom: "8px" }}>Proposed Subthemes</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
                {subthemes.map((sub, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-dim)",
                      borderRadius: "var(--panel-radius)",
                      padding: "8px 12px"
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--fg-primary)" }}>{sub.name}</div>
                    <div className="meta-dim" style={{ marginTop: "4px" }}>Sectors: {sub.sectorCodes?.join(", ")}</div>
                    <div className="meta-dim">Sample: {sub.sampleSymbols?.join(", ")}</div>
                  </div>
                ))}
              </div>
            </div>

            {evidence.length > 0 && (
              <div>
                <strong className="text-table-header" style={{ display: "block", marginBottom: "8px" }}>Evidence Quotes</strong>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {evidence.map((ev, idx) => (
                    <blockquote
                      key={idx}
                      style={{
                        margin: 0,
                        paddingLeft: "12px",
                        borderLeft: "2px solid var(--accent-blue)",
                        color: "var(--fg-secondary)",
                        fontSize: "0.75rem",
                        fontStyle: "italic"
                      }}
                    >
                      "{ev.quote}"
                      <span className="meta-dim" style={{ display: "block", marginTop: "2px", fontStyle: "normal" }}>
                        — {ev.symbol || "unknown"}{ev.accessionNo ? ` (accession: ${ev.accessionNo})` : ""}
                      </span>
                    </blockquote>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
