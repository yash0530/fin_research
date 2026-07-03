import { listJournalEntries } from "@/lib/journal-data";
import Link from "next/link";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function actionBadgeClass(action: string): string {
  const upper = action.toUpperCase();
  if (upper === "BUY") return "buy";
  if (upper === "TRIM" || upper === "SELL") return "trim";
  if (upper === "AVOID") return "avoid";
  return "hold"; // HOLD, NOTE, etc.
}

export default async function JournalPage() {
  const entries = await listJournalEntries();

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      <header className="hero" style={{ marginBottom: "2rem" }}>
        <div className="eyebrow">Decision Log</div>
        <h1 className="story-h1">Journal</h1>
        <p className="lead">
          Investment journal entries — logged buys, theses, and invalidation criteria, newest first.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
          <h2 className="story-h2">No Journal Entries</h2>
          <p className="body" style={{ color: "var(--muted)", margin: "1rem 0" }}>
            Journal entries are created from logged buys (buy-list execution) and manual notes
            recorded through the CLI.
          </p>
          <p className="body" style={{ color: "var(--muted)", fontSize: "14px", marginTop: "1rem" }}>
            This page is read-only — entries are written by the engine pipeline.
          </p>
        </div>
      ) : (
        <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "1rem", overflowX: "auto", margin: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--line)" }}>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Date</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Symbol</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Action</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Thesis</th>
                <th style={{ padding: "0.75rem 1rem", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Invalidation</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "0.75rem 1rem", fontSize: "12px", fontFamily: "var(--fmono)", color: "var(--faint)", whiteSpace: "nowrap" }}>
                    {entry.createdAt.slice(0, 10)}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 700, fontSize: "15px" }}>
                    <Link href={`/tickers/${entry.symbol}`} style={{ color: "var(--accent-deep)", textDecoration: "none" }}>
                      {entry.symbol}
                    </Link>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span
                      className={`verdict-badge ${actionBadgeClass(entry.action)}`}
                      style={{
                        marginTop: 0,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        textTransform: "uppercase",
                        fontSize: "10px",
                        fontWeight: 600,
                      }}
                    >
                      {entry.action}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontSize: "14px", color: "var(--ink)", maxWidth: "320px" }}>
                    {entry.thesis}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontSize: "13px", color: "var(--muted)", maxWidth: "240px", fontStyle: entry.invalidation ? "normal" : "italic" }}>
                    {entry.invalidation ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: "12px", color: "var(--faint)", fontStyle: "italic", marginTop: "1.5rem" }}>
        This page is read-only. Entries are created by the buy-list pipeline and manual CLI notes.
      </p>

      <div style={{ marginTop: "1.5rem" }}>
        <Link href="/" className="verdict-badge buy" style={{ textDecoration: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "14px", marginTop: 0 }}>
          ← Back to Digest
        </Link>
      </div>
    </div>
  );
}
