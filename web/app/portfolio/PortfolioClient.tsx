"use client";

import { useState } from "react";
import Link from "next/link";
import PositionForm from "./PositionForm";
import { removePositionAction } from "./actions";
import type { PortfolioPosition } from "../../lib/portfolio-data";

interface PortfolioClientProps {
  positions: PortfolioPosition[];
}

export default function PortfolioClient({ positions }: PortfolioClientProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(
    positions.length > 0 ? positions[0].symbol : null
  );
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
  const [error, setError] = useState("");

  const handleRemove = async (symbol: string) => {
    if (!confirm(`Are you sure you want to remove the ${symbol} position?`)) {
      return;
    }
    setError("");
    try {
      const res = await removePositionAction(symbol);
      if (!res.ok) {
        setError(res.error || "Failed to remove position");
      } else {
        if (selectedSymbol === symbol) {
          const remaining = positions.filter((p) => p.symbol !== symbol);
          setSelectedSymbol(remaining.length > 0 ? remaining[0].symbol : null);
        }
        if (editingPosition?.symbol === symbol) {
          setEditingPosition(null);
        }
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    }
  };

  // Find active position details
  const activePosition = positions.find((p) => p.symbol === selectedSymbol);

  // Totals calculations
  let totalCostBasis = 0;
  let totalMarketValue = 0;
  let hasMissingPrice = false;

  positions.forEach((p) => {
    totalCostBasis += p.costBasis;
    if (p.marketValue !== null) {
      totalMarketValue += p.marketValue;
    } else {
      hasMissingPrice = true;
    }
  });

  const totalPnl = totalCostBasis > 0 ? totalMarketValue - totalCostBasis : 0;
  const totalPnlPct = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;

  // Badge styles for decay findings
  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case "critical":
        return {
          background: "rgba(239, 68, 68, 0.15)",
          color: "#ef4444",
          border: "1px solid rgba(239, 68, 68, 0.3)",
        };
      case "warn":
        return {
          background: "rgba(245, 158, 11, 0.15)",
          color: "#f59e0b",
          border: "1px solid rgba(245, 158, 11, 0.3)",
        };
      case "info":
      default:
        return {
          background: "rgba(59, 130, 246, 0.15)",
          color: "#3b82f6",
          border: "1px solid rgba(59, 130, 246, 0.3)",
        };
    }
  };

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      <header className="hero" style={{ marginBottom: "2rem" }}>
        <div className="eyebrow">Workstation</div>
        <h1 className="story-h1">Portfolio Monitor</h1>
        <p className="lead">
          Track active positions, evaluate mechanical decay signals, and monitor manual thesis invalidation criteria.
        </p>
      </header>

      {error && (
        <div className="panel" style={{ border: "1px solid var(--neg)", background: "rgba(239, 68, 68, 0.1)", color: "var(--neg)", borderRadius: "8px", padding: "1rem" }}>
          {error}
        </div>
      )}

      {positions.length === 0 ? (
        <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
          <h2 className="story-h2">No Positions Tracked</h2>
          <p className="body" style={{ color: "var(--muted)", margin: "1rem 0" }}>
            Your portfolio is currently empty. Add your first position below to begin tracking thesis-decay invalidation rules.
          </p>
        </div>
      ) : (
        <>
          {/* Portfolio Totals Tape */}
          <div className="tape" style={{ margin: "1.5rem 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1px" }}>
            <div className="cell" style={{ background: "var(--surface)" }}>
              <div className="k" style={{ textTransform: "uppercase", fontSize: "11px", color: "var(--muted)" }}>Total Cost Basis</div>
              <div className="v" style={{ fontFamily: "var(--fdisp)", fontSize: "28px", fontWeight: 500 }}>
                ${totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="cell" style={{ background: "var(--surface)" }}>
              <div className="k" style={{ textTransform: "uppercase", fontSize: "11px", color: "var(--muted)" }}>Total Market Value</div>
              <div className="v" style={{ fontFamily: "var(--fdisp)", fontSize: "28px", fontWeight: 500 }}>
                ${totalMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {hasMissingPrice && <span style={{ fontSize: "12px", color: "var(--warn)", marginLeft: "4px" }} title="Some prices are missing">*</span>}
              </div>
            </div>
            <div className="cell" style={{ background: "var(--surface)" }}>
              <div className="k" style={{ textTransform: "uppercase", fontSize: "11px", color: "var(--muted)" }}>Total P&L</div>
              <div className={`v ${totalPnl >= 0 ? "up" : "down"}`} style={{ fontFamily: "var(--fdisp)", fontSize: "28px", fontWeight: 500, color: totalPnl >= 0 ? "var(--pos)" : "var(--neg)" }}>
                {totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span style={{ fontSize: "14px", fontWeight: "normal", marginLeft: "8px", color: "var(--muted)" }}>
                  ({totalPnl >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Positions Table */}
          <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1rem", overflowX: "auto", marginBottom: "2rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--line)" }}>
                  <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Symbol</th>
                  <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", textAlign: "right" }}>Qty</th>
                  <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", textAlign: "right" }}>Avg Cost</th>
                  <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", textAlign: "right" }}>Last</th>
                  <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", textAlign: "right" }}>Mkt Value</th>
                  <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", textAlign: "right" }}>P&L %</th>
                  <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Decay / Tripwires</th>
                  <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((row) => {
                  const isSelected = row.symbol === selectedSymbol;
                  const isPnlPos = row.pnlPct !== null && row.pnlPct >= 0;
                  return (
                    <tr
                      key={row.symbol}
                      onClick={() => setSelectedSymbol(row.symbol)}
                      style={{
                        borderBottom: "1px solid var(--line)",
                        cursor: "pointer",
                        background: isSelected ? "var(--inset)" : "transparent",
                        transition: "background 0.15s",
                      }}
                    >
                      <td style={{ padding: "1rem", fontWeight: 700, fontSize: "16px" }}>
                        <Link
                          href={`/tickers/${row.symbol}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: "var(--accent-deep)", textDecoration: "none" }}
                        >
                          {row.symbol}
                        </Link>
                      </td>
                      <td style={{ padding: "1rem", fontSize: "14px", fontFamily: "var(--fmono)", textAlign: "right" }}>
                        {row.qty.toLocaleString()}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "14px", fontFamily: "var(--fmono)", textAlign: "right" }}>
                        ${row.avgCost.toFixed(2)}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "14px", fontFamily: "var(--fmono)", textAlign: "right" }}>
                        {row.currentPrice !== null ? `$${row.currentPrice.toFixed(2)}` : "—"}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "14px", fontFamily: "var(--fmono)", textAlign: "right" }}>
                        {row.marketValue !== null ? `$${row.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td
                        className="num"
                        style={{
                          padding: "1rem",
                          fontSize: "14px",
                          fontFamily: "var(--fmono)",
                          textAlign: "right",
                          fontWeight: 600,
                          color: row.pnlPct === null ? "var(--muted)" : isPnlPos ? "var(--pos)" : "var(--neg)",
                        }}
                      >
                        {row.pnlPct !== null ? (
                          <>
                            {isPnlPos ? "+" : ""}
                            {row.pnlPct.toFixed(2)}%
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "13px" }}>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {row.findings.length === 0 ? (
                            <span style={{ fontSize: "10px", color: "var(--muted)" }}>No alerts</span>
                          ) : (
                            row.findings.map((f, idx) => (
                              <span
                                key={idx}
                                style={{
                                  fontSize: "9px",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  ...getSeverityStyle(f.severity),
                                }}
                                title={f.message}
                              >
                                {f.kind.replace("_", " ")}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "1rem", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingPosition(row)}
                          className="verdict-badge hold"
                          style={{
                            border: "none",
                            cursor: "pointer",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            marginTop: 0,
                            marginRight: "6px",
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemove(row.symbol)}
                          className="verdict-badge avoid"
                          style={{
                            border: "none",
                            cursor: "pointer",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            marginTop: 0,
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Selected Position Detail (Dossier Verdict + Manual Invalidation Checklist) */}
      {activePosition && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
          {/* Thesis Verdict Card */}
          <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1.5rem", margin: 0 }}>
            <h3 className="story-h2" style={{ fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", borderBottom: "1px solid var(--line)", paddingBottom: "0.5rem", marginBottom: "1rem" }}>
              Latest Dossier Verdict ({activePosition.symbol})
            </h3>
            {activePosition.latestVerdict ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className={`verdict-badge ${activePosition.latestVerdict.action?.toLowerCase() === "buy" ? "buy" : activePosition.latestVerdict.action?.toLowerCase() === "avoid" ? "avoid" : "hold"}`} style={{ marginTop: 0 }}>
                    {activePosition.latestVerdict.action} · {activePosition.latestVerdict.conviction} Conviction
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                  <div style={{ background: "var(--inset)", padding: "10px", borderRadius: "8px" }}>
                    <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>Target Price Range</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, fontFamily: "var(--fmono)", color: "var(--ink)", marginTop: "4px" }}>
                      ${activePosition.latestVerdict.targetLow ?? "—"} - ${activePosition.latestVerdict.targetHigh ?? "—"}
                    </div>
                  </div>
                  <div style={{ background: "var(--inset)", padding: "10px", borderRadius: "8px" }}>
                    <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>Stop Price</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, fontFamily: "var(--fmono)", color: "var(--ink)", marginTop: "4px" }}>
                      {activePosition.latestVerdict.stopPrice !== null ? `$${activePosition.latestVerdict.stopPrice.toFixed(2)}` : "None"}
                    </div>
                  </div>
                  <div style={{ background: "var(--inset)", padding: "10px", borderRadius: "8px", gridColumn: "span 2" }}>
                    <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>Governed Position Size</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, fontFamily: "var(--fmono)", color: "var(--ink)", marginTop: "4px" }}>
                      {activePosition.latestVerdict.governedSizePct !== null ? `${activePosition.latestVerdict.governedSizePct}%` : "—"}
                    </div>
                  </div>
                </div>
                {activePosition.latestVerdict.dossierId && (
                  <Link
                    href={`/dossiers/${activePosition.latestVerdict.dossierId}`}
                    className="verdict-badge buy"
                    style={{ textDecoration: "none", textAlign: "center", justifyContent: "center", display: "flex", padding: "10px", borderRadius: "8px", width: "100%" }}
                  >
                    View Source Dossier
                  </Link>
                )}
              </div>
            ) : (
              <div style={{ color: "var(--muted)", fontSize: "14px", textAlign: "center", padding: "2rem" }}>
                No verified dossier verdict found for {activePosition.symbol}.
                <div style={{ marginTop: "1rem" }}>
                  <Link href="/dossiers" style={{ textDecoration: "underline", color: "var(--accent-deep)" }}>
                    Go to Dossiers to generate research
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* WWCM checklist */}
          <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1.5rem", margin: 0 }}>
            <h3 className="story-h2" style={{ fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", borderBottom: "1px solid var(--line)", paddingBottom: "0.5rem", marginBottom: "1rem" }}>
              Thesis monitoring checklist ({activePosition.symbol})
            </h3>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "1rem" }}>
              <strong>Monitor:</strong> If any of these conditions occur, the original thesis is falsified (manual check).
            </div>
            {activePosition.latestVerdict && activePosition.latestVerdict.what_would_change_mind.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {activePosition.latestVerdict.what_would_change_mind.map((condition, idx) => (
                  <label
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      fontSize: "13.5px",
                      color: "var(--ink)",
                      cursor: "pointer",
                      padding: "8px",
                      borderRadius: "6px",
                      background: "var(--inset)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{
                        marginTop: "3px",
                        width: "16px",
                        height: "16px",
                        accentColor: "var(--accent)",
                        flexShrink: 0,
                      }}
                    />
                    <span>{condition}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--muted)", fontSize: "13px", textAlign: "center", padding: "2rem" }}>
                No &quot;what would change mind&quot; invalidation criteria defined.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Position Panel */}
      <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1.5rem", marginTop: "1rem" }}>
        <h3 className="story-h2" style={{ fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", borderBottom: "1px solid var(--line)", paddingBottom: "0.5rem", marginBottom: "1.25rem" }}>
          {editingPosition ? `Edit Position (${editingPosition.symbol})` : "Add New Position"}
        </h3>
        <PositionForm
          initialSymbol={editingPosition?.symbol || ""}
          initialQty={editingPosition?.qty}
          initialAvgCost={editingPosition?.avgCost}
          initialOpenedAt={editingPosition?.openedAt}
          onSuccess={() => {
            setEditingPosition(null);
          }}
          onCancel={
            editingPosition
              ? () => {
                  setEditingPosition(null);
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
