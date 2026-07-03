import { listRuleEvents } from "@/lib/signals-data";
import Link from "next/link";
import "@/components/story/story.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical": return "avoid";
    case "warn": return "hold";
    default: return "buy";
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case "critical": return "Critical";
    case "warn": return "Warn";
    default: return "Info";
  }
}

/** Group events by day (YYYY-MM-DD prefix of firedAt). */
function groupByDay(events: Awaited<ReturnType<typeof listRuleEvents>>): Map<string, typeof events> {
  const groups = new Map<string, typeof events>();
  for (const ev of events) {
    const day = ev.firedAt.slice(0, 10); // YYYY-MM-DD
    const bucket = groups.get(day);
    if (bucket) {
      bucket.push(ev);
    } else {
      groups.set(day, [ev]);
    }
  }
  return groups;
}

export default async function SignalsPage() {
  const events = await listRuleEvents();
  const grouped = groupByDay(events);

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      <header className="hero" style={{ marginBottom: "2rem" }}>
        <div className="eyebrow">Tripwire Monitor</div>
        <h1 className="story-h1">Signals</h1>
        <p className="lead">
          Rule-event history from the tripwire engine, newest first.
          Severity chips indicate criticality.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="panel" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
          <h2 className="story-h2">No Signals Yet</h2>
          <p className="body" style={{ color: "var(--muted)", margin: "1rem 0" }}>
            No rule events have been recorded. Run the tripwire job to generate signals:
          </p>
          <pre style={{
            background: "var(--inset)",
            color: "var(--ink)",
            padding: "12px",
            borderRadius: "6px",
            fontFamily: "var(--fmono)",
            fontSize: "14px",
            overflowX: "auto",
            border: "1px solid var(--line)",
            display: "inline-block",
          }}>
            npm run job -- rules
          </pre>
          <p className="body" style={{ color: "var(--muted)", fontSize: "14px", marginTop: "1.5rem" }}>
            Acknowledgment (ack) is available via the CLI — this page is read-only.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {Array.from(grouped.entries()).map(([day, dayEvents]) => (
            <div key={day}>
              <div style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--muted)",
                fontWeight: 600,
                marginBottom: "10px",
                fontFamily: "var(--fmono)",
                borderBottom: "1px solid var(--line)",
                paddingBottom: "6px",
              }}>
                {day}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {dayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="panel"
                    style={{
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      borderRadius: "10px",
                      padding: "14px 18px",
                      margin: 0,
                      opacity: ev.acked ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", flexWrap: "wrap" }}>
                      <span
                        className={`verdict-badge ${severityBadgeClass(ev.severity)}`}
                        style={{
                          marginTop: 0,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          fontSize: "10px",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {severityLabel(ev.severity)}
                      </span>

                      <span style={{
                        fontFamily: "var(--fmono)",
                        fontSize: "11px",
                        color: "var(--faint)",
                        background: "var(--surface-2)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        flexShrink: 0,
                      }}>
                        {ev.ruleId}
                      </span>

                      {ev.acked && (
                        <span style={{
                          fontSize: "10px",
                          color: "var(--muted)",
                          fontFamily: "var(--fmono)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}>
                          acked
                        </span>
                      )}

                      <span style={{
                        marginLeft: "auto",
                        fontSize: "11px",
                        color: "var(--faint)",
                        fontFamily: "var(--fmono)",
                        flexShrink: 0,
                      }}>
                        {ev.firedAt}
                      </span>
                    </div>

                    <p className="body" style={{ fontSize: "14px", margin: "8px 0 0" }}>
                      {ev.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p style={{ fontSize: "12px", color: "var(--faint)", fontStyle: "italic", marginTop: "1rem" }}>
            Acknowledgment is handled via the CLI (<code style={{ fontFamily: "var(--fmono)" }}>npm run job -- rules</code>). This page is read-only.
          </p>
        </div>
      )}

      <div style={{ marginTop: "2rem" }}>
        <Link href="/" className="verdict-badge buy" style={{ textDecoration: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "14px", marginTop: 0 }}>
          ← Back to Digest
        </Link>
      </div>
    </div>
  );
}
