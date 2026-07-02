import type { Insight } from "@engine/research/synthesize";

export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return <p className="muted">No insights.</p>;
  return (
    <div>
      {insights.map((i, idx) => (
        <div className="panel" key={idx}>
          <span className={`badge sev-${i.severity}`}>{i.severity.toUpperCase()}</span>{" "}
          <span>{i.text}</span>
          {i.sectorCode ? <span className="muted"> · {i.sectorCode}</span> : null}
          <div className="evidence">evidence: {i.evidence}</div>
        </div>
      ))}
    </div>
  );
}
