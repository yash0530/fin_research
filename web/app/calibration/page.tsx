import { listRecCalls, tierSummary, isFavorableCall } from "@/lib/calibration-data";
import Link from "next/link";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatPrice(val: number | null): string {
  if (val === null || val === undefined) return "—";
  return `$${val.toFixed(2)}`;
}

function formatTargets(low: number | null, high: number | null, stop: number | null): string {
  const parts = [];
  if (low !== null || high !== null) {
    const lowStr = low !== null ? `$${low.toFixed(2)}` : "—";
    const highStr = high !== null ? `$${high.toFixed(2)}` : "—";
    parts.push(`${lowStr}–${highStr}`);
  }
  if (stop !== null) {
    parts.push(`Stop: $${stop.toFixed(2)}`);
  }
  return parts.length > 0 ? parts.join(" / ") : "—";
}

function renderOutcome(val: number | null) {
  if (val === null) {
    return <span className="muted" style={{ fontSize: "11px", fontStyle: "italic" }}>Pending</span>;
  }
  const isPos = val > 0;
  const isNeg = val < 0;
  const formatted = val > 0 ? `+${val.toFixed(1)}%` : `${val.toFixed(1)}%`;
  return (
    <span
      className={isPos ? "up" : isNeg ? "down" : ""}
      style={{ fontFamily: "var(--fmono)", fontWeight: 600 }}
    >
      {formatted}
    </span>
  );
}

function getActionBadgeClass(action: string): string {
  const a = (action || "").toUpperCase();
  if (a === "BUY") return "buy";
  if (a === "HOLD") return "hold";
  if (a === "TRIM") return "trim";
  if (a === "AVOID") return "avoid";
  return "hold";
}

function renderConvictionBadge(conviction: string) {
  const c = (conviction || "LOW").toUpperCase();
  let color = "var(--muted)";
  let bg = "var(--inset)";
  if (c === "HIGH") {
    color = "var(--accent-deep)";
    bg = "var(--accent-soft)";
  } else if (c === "MEDIUM") {
    color = "var(--warn)";
    bg = "color-mix(in srgb, var(--warn) 15%, transparent)";
  } else if (c === "LOW") {
    color = "var(--neg)";
    bg = "color-mix(in srgb, var(--neg) 15%, transparent)";
  }
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        textTransform: "uppercase",
        color,
        backgroundColor: bg,
      }}
    >
      {c}
    </span>
  );
}

export default async function CalibrationPage() {
  const summaries = await tierSummary();
  const calls = await listRecCalls();

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      <header className="hero" style={{ marginBottom: "2rem" }}>
        <div className="eyebrow">Capital Discipline Layer</div>
        <h1 className="story-h1">Governor Calibration</h1>
        <p className="lead">
          System conviction tiers, outcome rates, and trust calibration settings.
        </p>
      </header>

      {/* Sizing Explainer Block */}
      <div className="callout" style={{ marginBottom: "2rem", borderLeftColor: "var(--accent)" }}>
        <strong style={{ display: "block", marginBottom: "0.25rem", color: "var(--accent-deep)" }}>
          The Sizing-Trust Philosophy
        </strong>
        <p className="body" style={{ fontSize: "14px", margin: 0, color: "var(--ink)" }}>
          The sizing governor caps the Judge's recommended position size to 2% until a conviction tier earns calibration.
          Edge is demonstrated once a tier has at least 5 resolved calls with a 50% or better favorable rate.
          Once this calibration is earned, the cap is lifted, and the Judge's recommended size is trusted.
        </p>
      </div>

      {/* Conviction Tiers Summary Table */}
      <div style={{ marginBottom: "2.5rem" }}>
        <h2 className="story-h2" style={{ marginBottom: "1rem" }}>Conviction Tiers</h2>
        <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Conviction Tier</th>
                <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Resolved / Total</th>
                <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Favorable Rate</th>
                <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Cap Status</th>
                <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Governor Status Line</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((summary) => (
                <tr key={summary.tier} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "1rem", fontWeight: 600 }}>
                    {renderConvictionBadge(summary.tier)}
                  </td>
                  <td style={{ padding: "1rem", fontSize: "14px" }}>
                    {summary.resolved} / {summary.total}
                  </td>
                  <td style={{ padding: "1rem", fontSize: "14px", fontWeight: 600 }}>
                    {summary.favorableRate !== null
                      ? `${(summary.favorableRate * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                  <td style={{ padding: "1rem", fontSize: "14px" }}>
                    {summary.capLifted ? (
                      <span className="up" style={{ fontWeight: 600 }}>LIFTED</span>
                    ) : (
                      <span className="muted" style={{ fontWeight: 500 }}>2.0% CAPPED</span>
                    )}
                  </td>
                  <td style={{ padding: "1rem", fontSize: "13px", fontFamily: "var(--fmono)", color: "var(--muted)" }}>
                    {summary.statusLine}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RecCalls Log Table */}
      <div>
        <h2 className="story-h2" style={{ marginBottom: "1rem" }}>Recommendation &amp; Calibration Log</h2>
        <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1rem", overflowX: "auto" }}>
          {calls.length === 0 ? (
            <p className="body muted" style={{ padding: "1rem", textAlign: "center" }}>No recommendation calls have been recorded yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Symbol</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Dossier</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Action</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Conviction</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Price At Call</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Targets / Stops</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Judge → Governed Size</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }} colSpan={4}>Outcomes</th>
                </tr>
                <tr style={{ borderBottom: "2px solid var(--line)" }}>
                  <th colSpan={7}></th>
                  <th style={{ padding: "0.5rem", fontSize: "11px", textTransform: "uppercase", textAlign: "center", color: "var(--muted)" }}>1M</th>
                  <th style={{ padding: "0.5rem", fontSize: "11px", textTransform: "uppercase", textAlign: "center", color: "var(--muted)" }}>3M</th>
                  <th style={{ padding: "0.5rem", fontSize: "11px", textTransform: "uppercase", textAlign: "center", color: "var(--muted)" }}>6M</th>
                  <th style={{ padding: "0.5rem", fontSize: "11px", textTransform: "uppercase", textAlign: "center", color: "var(--muted)" }}>1Y</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((row) => {
                  const badgeClass = getActionBadgeClass(row.action);
                  return (
                    <tr key={row.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "1rem", fontWeight: 600 }}>
                        <Link href={`/tickers/${row.symbol}`} style={{ color: "var(--accent-deep)", textDecoration: "none" }}>
                          {row.symbol}
                        </Link>
                      </td>
                      <td style={{ padding: "1rem", fontSize: "13px" }}>
                        <Link href={`/dossiers/${row.dossierId}`} style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>
                          View
                        </Link>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <span className={`verdict-badge ${badgeClass}`} style={{ marginTop: 0, padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 600 }}>
                          {row.action}
                        </span>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        {renderConvictionBadge(row.conviction)}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "14px", fontFamily: "var(--fmono)" }}>
                        {formatPrice(row.priceAtCall)}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "13px", color: "var(--muted)" }}>
                        {formatTargets(row.targetLow, row.targetHigh, row.stopPrice)}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "13px" }}>
                        <div style={{ fontWeight: 600, fontFamily: "var(--fmono)" }}>
                          {row.judgeSizePct.toFixed(1)}% → {row.governedSizePct.toFixed(1)}%
                        </div>
                        {row.governorReason && (
                          <div className="muted" style={{ fontSize: "11px", marginTop: "2px", lineHeight: "1.25" }}>
                            {row.governorReason}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 0.5rem", fontSize: "13px", textAlign: "center" }}>
                        {renderOutcome(row.outcome1mPct)}
                      </td>
                      <td style={{ padding: "0.75rem 0.5rem", fontSize: "13px", textAlign: "center" }}>
                        {renderOutcome(row.outcome3mPct)}
                      </td>
                      <td style={{ padding: "0.75rem 0.5rem", fontSize: "13px", textAlign: "center" }}>
                        {renderOutcome(row.outcome6mPct)}
                      </td>
                      <td style={{ padding: "0.75rem 0.5rem", fontSize: "13px", textAlign: "center" }}>
                        {renderOutcome(row.outcome1yPct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
