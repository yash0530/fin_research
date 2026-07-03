import { getLatestBuyList, getCandidatesPreview } from "@/lib/buylist-data";
import Link from "next/link";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatPrice(val: number | null): string {
  if (val === null || val === undefined) return "—";
  return `$${val.toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

export default async function BuyListPage() {
  const buyList = await getLatestBuyList();
  const candidates = await getCandidatesPreview();

  const hasSavedList = buyList !== null && buyList.items.length > 0;

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      <header className="hero" style={{ marginBottom: "2rem" }}>
        <div className="eyebrow">Monthly Ritual</div>
        <h1 className="story-h1">
          {hasSavedList ? `Buy List · ${buyList.month}` : "Buy List Allocation"}
        </h1>
        <p className="lead">
          {hasSavedList
            ? `Allocation plan for ${buyList.month} using $${buyList.capitalUsd.toLocaleString()} capital.`
            : "Monthly capital allocation plan governed by calibrated conviction limits."}
        </p>
      </header>

      {hasSavedList ? (
        /* SAVED BUY LIST STATE */
        <div>
          <div className="callout" style={{ marginBottom: "2rem", borderLeftColor: "var(--accent)" }}>
            <strong style={{ display: "block", marginBottom: "0.25rem", color: "var(--accent-deep)" }}>
              Plan Status: {buyList.status.toUpperCase()}
            </strong>
            <p className="body" style={{ fontSize: "14px", margin: 0, color: "var(--ink)" }}>
              This buy-list was compiled on {formatDate(buyList.createdAt)}. Log actual buys in your own brokerage — ENGINE never executes trades automatically.
            </p>
          </div>

          <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1rem", overflowX: "auto", marginBottom: "2rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Rank</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Symbol</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Dossier</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Gov. Size</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Planned Allocation</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Execution Status</th>
                  <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Governor Note</th>
                </tr>
              </thead>
              <tbody>
                {buyList.items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--line)", opacity: item.skipped ? 0.6 : 1 }}>
                    <td style={{ padding: "1rem", fontWeight: 600, fontSize: "14px" }}>
                      {item.rank}
                    </td>
                    <td style={{ padding: "1rem", fontWeight: 600 }}>
                      <Link href={`/tickers/${item.symbol}`} style={{ color: "var(--accent-deep)", textDecoration: "none" }}>
                        {item.symbol}
                      </Link>
                    </td>
                    <td style={{ padding: "1rem", fontSize: "13px" }}>
                      {item.dossierId ? (
                        <Link href={`/dossiers/${item.dossierId}`} style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>
                          View
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "1rem", fontSize: "14px", fontFamily: "var(--fmono)" }}>
                      {item.governedSizePct !== null ? `${item.governedSizePct.toFixed(1)}%` : "—"}
                    </td>
                    <td style={{ padding: "1rem", fontSize: "14px", fontWeight: 600 }}>
                      {item.skipped ? (
                        <span className="muted">Skipped</span>
                      ) : (
                        `$${item.plannedUsd.toLocaleString()}`
                      )}
                    </td>
                    <td style={{ padding: "1rem", fontSize: "13px" }}>
                      {item.skipped ? (
                        <span className="muted">Below minimum lot</span>
                      ) : item.executedAt ? (
                        <span className="up" style={{ fontWeight: 600 }}>
                          Executed: ${item.actualUsd?.toLocaleString()} @ {formatPrice(item.actualPrice)} ({formatDate(item.executedAt)})
                        </span>
                      ) : (
                        <span className="muted">Pending log</span>
                      )}
                    </td>
                    <td style={{ padding: "1rem", fontSize: "13px", color: "var(--muted)", maxWidth: "250px" }}>
                      {item.governorReason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="disclaimer" style={{ marginTop: "1rem" }}>
            Log actual buys in your own brokerage — ENGINE never executes trades or connects to broker APIs.
          </p>
        </div>
      ) : (
        /* EMPTY STATE / CANDIDATES PREVIEW STATE */
        <div>
          {/* Ritual Explainer */}
          <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1.5rem", marginBottom: "2rem" }}>
            <h2 className="story-h2" style={{ marginTop: 0, marginBottom: "0.75rem" }}>The Monthly Buy-List Ritual</h2>
            <p className="body" style={{ color: "var(--ink)", fontSize: "15px", lineHeight: "1.6" }}>
              The monthly buy-list ritual allocates our monthly capital contribution (typically $2,500) across recent BUY recommendations.
              It ranks eligible candidates by conviction tier and confidence, sizing them conservatively using the governor-controlled size limits.
              This forms a concrete plan that is logged manually in your brokerage, maintaining the strict separation between research and execution.
            </p>
          </div>

          {/* CLI Tip */}
          <div className="callout" style={{ marginBottom: "2rem", borderLeftColor: "var(--warn)" }}>
            <strong style={{ display: "block", marginBottom: "0.25rem", color: "var(--warn)" }}>
              System Tip: Buy-List Job Pending
            </strong>
            <p className="body" style={{ fontSize: "14px", margin: 0, color: "var(--ink)" }}>
              No finalized monthly buy-list exists in the local database. A buy-list allocation job will be coming to automate compilation.
              In the future, you will run it from the command line:
            </p>
            <pre style={{
              background: "var(--inset)",
              color: "var(--ink)",
              padding: "10px",
              borderRadius: "6px",
              fontFamily: "var(--fmono)",
              fontSize: "13px",
              overflowX: "auto",
              border: "1px solid var(--line)",
              marginTop: "8px",
              marginBottom: 0,
            }}>
              npm run job -- buylist
            </pre>
          </div>

          {/* Candidates Preview */}
          <div>
            <h2 className="story-h2" style={{ marginBottom: "1rem" }}>Live Candidates Preview</h2>
            <p className="body dim" style={{ marginBottom: "1.25rem" }}>
              Showing active BUY recommendations generated within the last 45 days. These will be eligible for the next buy-list compilation.
            </p>
            <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1rem", overflowX: "auto" }}>
              {candidates.length === 0 ? (
                <p className="body muted" style={{ padding: "1.5rem", textAlign: "center" }}>
                  No active BUY candidates found within the last 45 days. Run a new dossier analysis to generate recommendations.
                </p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Symbol</th>
                      <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Dossier</th>
                      <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Conviction</th>
                      <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Price At Call</th>
                      <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Governed Size</th>
                      <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Age</th>
                      <th style={{ borderBottom: "2px solid var(--line)", padding: "0.75rem 1rem", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Governor Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => (
                      <tr key={candidate.dossierId} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "1rem", fontWeight: 600 }}>
                          <Link href={`/tickers/${candidate.symbol}`} style={{ color: "var(--accent-deep)", textDecoration: "none" }}>
                            {candidate.symbol}
                          </Link>
                        </td>
                        <td style={{ padding: "1rem", fontSize: "13px" }}>
                          <Link href={`/dossiers/${candidate.dossierId}`} style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>
                            View
                          </Link>
                        </td>
                        <td style={{ padding: "1rem" }}>
                          {renderConvictionBadge(candidate.conviction)}
                        </td>
                        <td style={{ padding: "1rem", fontSize: "14px", fontFamily: "var(--fmono)" }}>
                          {formatPrice(candidate.priceAtCall)}
                        </td>
                        <td style={{ padding: "1rem", fontSize: "14px", fontFamily: "var(--fmono)", fontWeight: 600 }}>
                          {candidate.governedSizePct.toFixed(1)}%
                        </td>
                        <td style={{ padding: "1rem", fontSize: "13px", color: "var(--muted)" }}>
                          {candidate.ageDays === 0 ? "Today" : `${candidate.ageDays}d ago`}
                        </td>
                        <td style={{ padding: "1rem", fontSize: "13px", color: "var(--muted)", maxWidth: "250px" }}>
                          {candidate.governorReason || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
