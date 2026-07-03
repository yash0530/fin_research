import { dossierById } from "@/lib/dossier-data";
import Link from "next/link";
import "@/components/story/story.css";
import type { StageName } from "@/lib/dossier-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STAGE_ORDER: StageName[] = [
  "classify",
  "research",
  "bull",
  "bear",
  "rebuttal",
  "judge",
  "critique",
  "judge_rev",
  "memo",
];

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

function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return <p className="muted" style={{ fontStyle: 'italic' }}>No content available.</p>;

  const paragraphs = content.split(/\n\n+/);
  return (
    <div className="markdown-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {paragraphs.map((p, idx) => {
        const trimmed = p.trim();
        if (trimmed.startsWith("### ")) {
          return <h4 key={idx} style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', margin: '8px 0 4px' }}>{trimmed.slice(4)}</h4>;
        }
        if (trimmed.startsWith("## ")) {
          return <h3 key={idx} style={{ fontSize: '17px', fontWeight: 600, color: 'var(--ink)', margin: '12px 0 6px' }}>{trimmed.slice(3)}</h3>;
        }
        if (trimmed.startsWith("# ")) {
          return <h2 key={idx} style={{ fontSize: '19px', fontWeight: 600, color: 'var(--ink)', margin: '16px 0 8px' }}>{trimmed.slice(2)}</h2>;
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const items = trimmed.split(/\n[-*]\s+/).map(item => item.replace(/^[-*]\s+/, ""));
          return (
            <ul key={idx} style={{ paddingLeft: '1.25rem', margin: '4px 0' }}>
              {items.map((item, itemIdx) => (
                <li key={itemIdx} style={{ fontSize: '14px', color: 'var(--ink)', marginBottom: '4px' }}>
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx} style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--ink)', margin: '4px 0' }}>
            {renderInlineMarkdown(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} style={{ fontWeight: 600 }}>{part}</strong>;
    }
    const subParts = part.split(/\*([^*]+)\*/g);
    return subParts.map((subPart, j) => {
      if (j % 2 === 1) {
        return <em key={j}>{subPart}</em>;
      }
      return subPart;
    });
  });
}

export default async function DossierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const dossier = await dossierById(decodedId);

  if (!dossier) {
    return (
      <div className="story-page" style={{ padding: "40px 24px" }}>
        <header className="hero" style={{ textAlign: "center", marginBottom: "40px" }}>
          <div className="eyebrow" style={{ justifyContent: "center" }}>Workstation Archive</div>
          <h1 className="story-h1">Dossier Not Found</h1>
          <p className="lead" style={{ margin: "0 auto 24px", maxWidth: "600px" }}>
            No dossier found with ID <strong style={{ color: 'var(--ink)' }}>{decodedId}</strong>.
          </p>
        </header>

        <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <p className="body" style={{ margin: '1rem 0' }}>
            Ensure the agentic debate run completed successfully or check the ID:
          </p>
          <div style={{ marginTop: '1.5rem' }}>
            <Link href="/dossiers" className="verdict-badge buy" style={{ textDecoration: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', marginTop: 0 }}>
              Back to Dossiers List
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Compute stage timings and statuses
  let prevAt = dossier.startedAt;
  let foundActive = false;
  const stageTimings = STAGE_ORDER.map((name) => {
    const record = dossier.stages[name];
    let elapsed: number | null = null;
    let status: "done" | "running" | "pending" = "pending";

    if (record) {
      status = "done";
      if (prevAt) {
        elapsed = record.at - prevAt;
      }
      prevAt = record.at;
    } else if (dossier.status === "running" && !foundActive) {
      status = "running";
      foundActive = true;
      if (prevAt) {
        elapsed = Date.now() - prevAt;
      }
    }
    return { name, elapsed, status };
  });

  let verdictClass = "hold";
  if (dossier.verdict?.recommendation === "BUY") verdictClass = "buy";
  else if (dossier.verdict?.recommendation === "AVOID") verdictClass = "avoid";
  else if (dossier.verdict?.recommendation === "TRIM") verdictClass = "hold";

  return (
    <div className="story-page" style={{ padding: "24px 0" }}>
      <header className="hero" style={{ marginBottom: "2rem" }}>
        <div className="eyebrow">
          <Link href="/dossiers" style={{ color: 'var(--accent-deep)', textDecoration: 'none' }}>Dossiers</Link> · Detail · {dossier.symbol}
        </div>
        <h1 className="story-h1">Dossier: {dossier.symbol}</h1>
        <p className="lead">
          Status: <span className={`verdict-badge ${dossier.status === 'done' || dossier.status === 'running' ? 'buy' : dossier.status === 'failed' ? 'avoid' : 'hold'}`} style={{ textTransform: 'uppercase', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', marginTop: 0 }}>{dossier.status}</span>
          {dossier.wallClockMs ? ` · Wall Clock: ${formatTime(dossier.wallClockMs)}` : ""}
        </p>
      </header>

      {dossier.error && (
        <div className="panel" style={{ border: '1px solid var(--neg)', background: 'color-mix(in srgb, var(--neg) 10%, transparent)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 className="story-h2" style={{ color: 'var(--neg)', fontSize: '1.1rem', marginTop: 0 }}>Dossier Failure Error</h3>
          <p className="body" style={{ fontFamily: 'var(--fmono)', fontSize: '13px', margin: 0, whiteSpace: 'pre-wrap' }}>
            {dossier.error}
          </p>
        </div>
      )}

      {/* Grid: Timeline and Verdict */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Stage Timeline */}
        <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.5rem', margin: 0 }}>
          <h3 className="story-h2" style={{ fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '1rem', marginTop: 0 }}>
            Stage Timeline
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {stageTimings.map((stage) => {
              let dot = "◌";
              let color = "var(--muted)";
              let textStyle: React.CSSProperties = { color: "var(--muted)" };
              if (stage.status === "done") {
                dot = "●";
                color = "var(--accent)";
                textStyle = { color: "var(--ink)" };
              } else if (stage.status === "running") {
                dot = "▶";
                color = "var(--warn)";
                textStyle = { color: "var(--warn)", fontWeight: 600 };
              }
              return (
                <div key={stage.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', ...textStyle }}>
                    <span style={{ color }}>{dot}</span>
                    <span style={{ textTransform: 'capitalize' }}>{stage.name.replace(/_/g, " ")}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--fmono)', fontSize: '12px', color: 'var(--muted)' }}>
                    {stage.status === "done" ? formatTime(stage.elapsed) : stage.status === "running" ? "Running" : "Pending"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Verdict Card */}
        <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.5rem', margin: 0 }}>
          <h3 className="story-h2" style={{ fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '1rem', marginTop: 0 }}>
            Investment Verdict
          </h3>

          {!dossier.verdict ? (
            <p className="body muted" style={{ fontStyle: 'italic', margin: '1rem 0' }}>
              Verdict is pending. The judge stage will formulate the final recommendation once the debate stages finish.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className={`verdict-badge ${verdictClass}`} style={{ marginTop: 0, padding: '4px 10px', borderRadius: '6px', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase' }}>
                  {dossier.verdict.recommendation}
                </span>
                <span className="verdict-badge hold" style={{ marginTop: 0, padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                  {dossier.verdict.conviction} CONVICTION
                </span>
              </div>

              <div className="body" style={{ fontWeight: 500, fontSize: '14px', borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem' }}>
                {dossier.verdict.summary}
              </div>

              {/* Price Targets & Stops */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem' }}>
                <div>
                  <span className="k" style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '2px' }}>Target Range</span>
                  <span style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--fmono)' }}>
                    ${dossier.verdict.target_price_range.low} - ${dossier.verdict.target_price_range.high}
                  </span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                    ({dossier.verdict.target_price_range.timeframe})
                  </span>
                </div>
                <div>
                  <span className="k" style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '2px' }}>Stop Price</span>
                  <span style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--fmono)', color: dossier.verdict.trade_plan.stop_price ? 'var(--neg)' : 'var(--muted)' }}>
                    {dossier.verdict.trade_plan.stop_price ? `$${dossier.verdict.trade_plan.stop_price}` : "None"}
                  </span>
                </div>
              </div>

              {/* Sizing comparison */}
              <div>
                <span className="k" style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem' }}>Position Size Calibration</span>
                <div style={{ display: 'flex', gap: '2rem' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>Judge Suggested</span>
                    <span style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--fmono)' }}>
                      {dossier.verdict.trade_plan.position_size_pct.toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: '2rem' }}>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>Governor Calibrated</span>
                    <span style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--fmono)', color: 'var(--accent)' }}>
                      {dossier.recCall?.governedSizePct !== undefined && dossier.recCall?.governedSizePct !== null ? `${dossier.recCall.governedSizePct.toFixed(2)}%` : "Pending"}
                    </span>
                  </div>
                </div>
                {dossier.recCall?.governorReason && (
                  <div style={{ background: 'var(--inset)', border: '1px solid var(--line)', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: 'var(--muted)', marginTop: '0.75rem', lineHeight: '1.4' }}>
                    <strong>Calibration Reason:</strong> {dossier.recCall.governorReason}
                  </div>
                )}
              </div>

              {/* What would change mind */}
              {dossier.verdict.what_would_change_mind && dossier.verdict.what_would_change_mind.length > 0 && (
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
                  <span className="k" style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem' }}>Tripwires / Change of Mind Catalysts</span>
                  <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
                    {dossier.verdict.what_would_change_mind.map((item, idx) => (
                      <li key={idx} style={{ fontSize: '13px', color: 'var(--ink)', marginBottom: '4px', lineHeight: '1.4' }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Accordion Debate */}
      <h3 className="story-h2" style={{ fontSize: '1.15rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
        Debate Ledger
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
        {/* Bull Thesis */}
        <details className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1rem', margin: 0 }} open>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '15px', color: 'var(--accent-deep)', outline: 'none', userSelect: 'none' }}>
            Bull Thesis
          </summary>
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
            <MarkdownRenderer content={dossier.bull?.thesis_md ?? ""} />
          </div>
        </details>

        {/* Bear Thesis */}
        <details className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1rem', margin: 0 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '15px', color: 'var(--neg)', outline: 'none', userSelect: 'none' }}>
            Bear Thesis (Independent attack)
          </summary>
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.5rem' }}>Independent Bear Case</h4>
              <MarkdownRenderer content={dossier.bear?.independent_bear_md ?? ""} />
            </div>
            {dossier.bear?.attack_md && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.5rem' }}>Targeted Attack on Bull Claims</h4>
                <MarkdownRenderer content={dossier.bear.attack_md} />
              </div>
            )}
          </div>
        </details>

        {/* Rebuttal */}
        <details className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1rem', margin: 0 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '15px', color: 'var(--warn)', outline: 'none', userSelect: 'none' }}>
            Rebuttal Stage
          </summary>
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
            <MarkdownRenderer content={dossier.rebuttal?.rebuttal_md ?? ""} />
          </div>
        </details>

        {/* Critique */}
        <details className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1rem', margin: 0 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '15px', color: 'var(--muted)', outline: 'none', userSelect: 'none' }}>
            Critique / Revision Suggestion
          </summary>
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
            {dossier.critique?.should_revise_verdict !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span className="k" style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--muted)' }}>Revision Requested:</span>
                <span className={`verdict-badge ${dossier.critique.should_revise_verdict ? 'avoid' : 'buy'}`} style={{ marginTop: 0, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', textTransform: 'uppercase' }}>
                  {dossier.critique.should_revise_verdict ? "YES" : "NO"}
                </span>
              </div>
            )}
            {dossier.critique?.revision_suggestion && (
              <div style={{ background: 'var(--inset)', border: '1px solid var(--line)', borderRadius: '6px', padding: '10px 14px', fontSize: '13px', color: 'var(--muted)', marginBottom: '1rem' }}>
                <strong>Revision Suggestion:</strong> {dossier.critique.revision_suggestion}
              </div>
            )}
            <MarkdownRenderer content={dossier.critique?.notes_md ?? ""} />
          </div>
        </details>
      </div>

      {/* Evidence Table */}
      {dossier.toolCalls.length > 0 && (
        <div className="panel" style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: '12px', padding: '1.5rem', overflowX: 'auto', margin: 0 }}>
          <h3 className="story-h2" style={{ fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)', paddingBottom: '0.5rem', marginBottom: '1rem', marginTop: 0 }}>
            Evidence Ledger (Tool Calls)
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '2px solid var(--line)', padding: '0.5rem 0.75rem', fontSize: '11px', textTransform: 'uppercase', textAlign: 'left' }}>Tool</th>
                <th style={{ borderBottom: '2px solid var(--line)', padding: '0.5rem 0.75rem', fontSize: '11px', textTransform: 'uppercase', textAlign: 'left' }}>Confidence</th>
                <th style={{ borderBottom: '2px solid var(--line)', padding: '0.5rem 0.75rem', fontSize: '11px', textTransform: 'uppercase', textAlign: 'left' }}>Data Status</th>
              </tr>
            </thead>
            <tbody>
              {dossier.toolCalls.map((tc, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '0.75rem', fontSize: '13px', fontFamily: 'var(--fmono)', fontWeight: 600 }}>{tc.tool}</td>
                  <td style={{ padding: '0.75rem', fontSize: '13px' }}>
                    {tc.confidence ? (
                      <span className={`verdict-badge ${tc.confidence === 'high' ? 'buy' : tc.confidence === 'medium' ? 'hold' : 'avoid'}`} style={{ marginTop: 0, padding: '2px 8px', borderRadius: '4px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                        {tc.confidence}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '13px', color: 'var(--muted)' }}>{tc.data_status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
