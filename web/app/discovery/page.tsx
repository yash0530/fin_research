import { listDiscoveryCandidates } from "@/lib/discovery-data";
import Link from "next/link";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function getStatusStyle(status: string) {
  switch (status.toLowerCase()) {
    case "accepted":
      return {
        background: "color-mix(in srgb, var(--pos) 15%, transparent)",
        color: "var(--pos)",
        border: "1px solid color-mix(in srgb, var(--pos) 30%, transparent)",
      };
    case "rejected":
      return {
        background: "color-mix(in srgb, var(--neg) 15%, transparent)",
        color: "var(--neg)",
        border: "1px solid color-mix(in srgb, var(--neg) 30%, transparent)",
      };
    case "ignored":
      return {
        background: "var(--surface-2)",
        color: "var(--muted)",
        border: "1px solid var(--line)",
      };
    case "new":
    default:
      return {
        background: "var(--accent-soft)",
        color: "var(--accent-deep)",
        border: "1px solid color-mix(in srgb, var(--accent-deep) 20%, transparent)",
      };
  }
}

function getSourceBadgeStyle(source: string) {
  switch (source.toLowerCase()) {
    case "capture":
      return { background: "rgba(147, 51, 234, 0.1)", color: "rgb(147, 51, 2 purple)" }; // Purple for capture
    case "movers":
      return { background: "rgba(245, 158, 11, 0.1)", color: "rgb(217, 119, 6)" }; // Amber for movers
    case "screener":
      return { background: "rgba(16, 185, 129, 0.1)", color: "rgb(5, 150, 105)" }; // Emerald for screener
    case "dossier":
      return { background: "rgba(59, 130, 246, 0.1)", color: "rgb(37, 99, 235)" }; // Blue for dossier
    default:
      return { background: "var(--surface-2)", color: "var(--muted)" };
  }
}

export default async function DiscoveryPage() {
  const candidates = await listDiscoveryCandidates();

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      <header className="hero" style={{ marginBottom: "2rem" }}>
        <div className="eyebrow">Workstation Queue</div>
        <h1 className="story-h1">Discovery Queue</h1>
        <p className="lead">
          Review companies identified by automated ingestion pipelines, commits, and movers filters.
        </p>
      </header>

      {/* Honesty note about CLI / actions */}
      <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--inset)", borderRadius: "12px", padding: "1.25rem", marginBottom: "2rem" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)", margin: "0 0 4px 0", display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: "var(--accent-deep)" }}>ℹ</span> CLI Review Protocol
        </h3>
        <p className="body dim" style={{ fontSize: "13px", margin: 0, lineHeight: 1.5 }}>
          Accepting and promoting candidates is handled through the **CLI backlog** for now. Direct promotion from this workstation dashboard is planned for the next release. Promoted candidates automatically become watchlisted tickers, starting historical price backfills and filings downloads.
        </p>
      </div>

      {/* Main content table */}
      {candidates.length === 0 ? (
        <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "4rem 2rem", textAlign: "center" }}>
          <h2 className="story-h2">No Discovery Candidates</h2>
          <p className="body" style={{ color: "var(--muted)", margin: "1rem auto", maxWidth: "480px" }}>
            The queue is currently empty. Candidates land here when background processes encounter tickers outside the S&P 500 universe.
          </p>
          <div style={{ marginTop: "2rem", display: "inline-flex", flexDirection: "column", gap: "8px", textAlign: "left", background: "var(--inset)", padding: "1.25rem", borderRadius: "8px", border: "1px solid var(--line)", width: "100%", maxWidth: "500px" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: "bold" }}>Inflow Writers</span>
            <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: "13px", color: "var(--ink)", display: "flex", flexDirection: "column", gap: "6px" }}>
              <li><strong>Movers Job:</strong> Flags outsized daily volume/price gainers.</li>
              <li><strong>Paste-Capture:</strong> Extracts tickers mentioned in research text.</li>
              <li><strong>Screener:</strong> Discovers non-universe tickers during external scanning.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1rem", overflowX: "auto", margin: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--line)" }}>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Symbol</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Source</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", textAlign: "center" }}>Occurrences</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Status</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>First Seen</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Last Seen</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((cand) => {
                const statusStyle = getStatusStyle(cand.status);
                const sourceStyle = getSourceBadgeStyle(cand.source);

                return (
                  <tr key={cand.symbol} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "1rem", fontWeight: 700, fontSize: "16px" }}>
                      <span style={{ color: "var(--ink)" }}>
                        {cand.symbol}
                      </span>
                    </td>
                    <td style={{ padding: "1rem" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.02em",
                          background: sourceStyle.background,
                          color: sourceStyle.color,
                        }}
                      >
                        {cand.source}
                      </span>
                    </td>
                    <td style={{ padding: "1rem", fontSize: "14px", fontFamily: "var(--fmono)", textAlign: "center", fontWeight: 600 }}>
                      {cand.occurrences}
                    </td>
                    <td style={{ padding: "1rem" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                          ...statusStyle,
                        }}
                      >
                        {cand.status}
                      </span>
                    </td>
                    <td style={{ padding: "1rem", fontSize: "13px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {formatDate(cand.firstSeen)}
                    </td>
                    <td style={{ padding: "1rem", fontSize: "13px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {formatDate(cand.lastSeen)}
                    </td>
                    <td style={{ padding: "1rem", fontSize: "13px", color: "var(--ink)", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cand.note ?? ""}>
                      {cand.note ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
