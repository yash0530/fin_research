import { listDossiers } from "@/lib/dossier-data";
import Link from "next/link";
import "@/components/story/story.css";
import RunDeepDive from "./RunDeepDive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatTime(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000) % 60;
  const mins = Math.floor(ms / 60000);
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function DossiersPage() {
  const dossiers = await listDossiers();

  if (dossiers.length === 0) {
    return (
      <div className="story-page" style={{ padding: "40px 24px" }}>
        <header className="hero" style={{ textAlign: "center", marginBottom: "40px" }}>
          <div className="eyebrow" style={{ justifyContent: "center" }}>Workstation Empty State</div>
          <h1 className="story-h1">No Dossiers Found</h1>
          <p className="lead" style={{ margin: "0 auto 24px", maxWidth: "600px" }}>
            The dossier queue is currently empty. No deep-dive analysis debates have been created.
          </p>
        </header>

        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <h2 className="story-h2" style={{ textAlign: 'center' }}>Start an agentic research debate</h2>
          <RunDeepDive />
        </div>
      </div>
    );
  }

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      <header className="hero" style={{ marginBottom: "2rem" }}>
        <div className="eyebrow">Workstation</div>
        <h1 className="story-h1">Research Dossiers</h1>
        <p className="lead">
          Queued deep-dive debates between autonomous agents. Each ends in a governed, citation-checked verdict.
        </p>
      </header>

      <RunDeepDive />

      <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1rem', overflowX: 'auto', margin: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '2px solid var(--line)', padding: '0.75rem 1rem', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Symbol</th>
              <th style={{ borderBottom: '2px solid var(--line)', padding: '0.75rem 1rem', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
              <th style={{ borderBottom: '2px solid var(--line)', padding: '0.75rem 1rem', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verdict</th>
              <th style={{ borderBottom: '2px solid var(--line)', padding: '0.75rem 1rem', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gov. Size</th>
              <th style={{ borderBottom: '2px solid var(--line)', padding: '0.75rem 1rem', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Started At</th>
              <th style={{ borderBottom: '2px solid var(--line)', padding: '0.75rem 1rem', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Update</th>
              <th style={{ borderBottom: '2px solid var(--line)', padding: '0.75rem 1rem', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Wall Clock</th>
            </tr>
          </thead>
          <tbody>
            {dossiers.map((row) => {
              let statusBadgeClass = "hold";
              if (row.status === "done") statusBadgeClass = "buy";
              else if (row.status === "running") statusBadgeClass = "buy";
              else if (row.status === "failed") statusBadgeClass = "avoid";

              let verdictText = "Pending";
              if (row.action && row.conviction) {
                verdictText = `${row.action} / ${row.conviction}`;
              } else if (row.status === "failed") {
                verdictText = "Failed";
              }

              return (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '1rem', fontWeight: 600 }}>
                    <Link href={`/dossiers/${row.id}`} style={{ color: 'var(--accent-deep)', textDecoration: 'none' }}>
                      {row.symbol}
                    </Link>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span className={`verdict-badge ${statusBadgeClass}`} style={{ marginTop: 0, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                      {row.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '14px', fontWeight: row.action ? 600 : 400 }}>
                    {verdictText}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '14px', fontFamily: 'var(--fmono)' }}>
                    {row.governedSizePct !== null ? `${row.governedSizePct.toFixed(2)}%` : "—"}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '13px', color: 'var(--muted)' }}>
                    {formatDate(row.startedAt)}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '13px', color: 'var(--muted)' }}>
                    {formatDate(row.updatedAt)}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '14px', fontFamily: 'var(--fmono)' }}>
                    {formatTime(row.wallClockMs)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
