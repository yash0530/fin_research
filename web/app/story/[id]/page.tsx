import { demoStory } from "@/lib/demo";
import { scenarioPrices } from "@engine/story/build";
import { ScenarioEstimator } from "@/components/ScenarioEstimator";

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = demoStory();
  const prices = scenarioPrices(data);

  return (
    <article>
      <h1>{data.title}</h1>
      <div className="panel">
        <span className={`badge sev-${data.hero.verdict === "AVOID" ? "critical" : "info"}`}>
          {data.hero.verdict} / {data.hero.conviction}
        </span>{" "}
        <span>{data.hero.thesis}</span>
        <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.4rem" }}>
          {data.symbol} · as of {data.asOf} · ${data.priceAtBuild} at build · route id: {id}
        </div>
      </div>

      <h2>Key stats</h2>
      <div className="panel">
        {data.statTape.map((s, i) => (
          <span key={i} style={{ marginRight: "1.5rem" }}>
            <span className="muted">{s.label}:</span> <strong>{s.value}</strong>
          </span>
        ))}
      </div>

      <h2>Cycle</h2>
      <div className="panel">
        <div style={{ position: "relative", height: 10, background: "var(--border)", borderRadius: 999 }}>
          <div
            style={{
              position: "absolute",
              left: `${data.cycleStrip.position * 100}%`,
              top: -4,
              width: 18,
              height: 18,
              background: "var(--info)",
              borderRadius: "50%",
              transform: "translateX(-50%)",
            }}
          />
        </div>
        <div className="muted" style={{ marginTop: "0.5rem" }}>
          Stage: <strong>{data.cycleStrip.stage}</strong>
        </div>
      </div>

      <h2>Deterministic scenario prices</h2>
      <div className="panel">
        <span style={{ marginRight: "1.5rem" }}>Bear <strong>${prices.bear.toFixed(2)}</strong></span>
        <span style={{ marginRight: "1.5rem" }}>Base <strong>${prices.base.toFixed(2)}</strong></span>
        <span>Bull <strong>${prices.bull.toFixed(2)}</strong></span>
      </div>

      <ScenarioEstimator data={data} />

      <h2>Callouts</h2>
      {data.callouts.map((c, i) => (
        <div className="panel" key={i}>{c}</div>
      ))}

      <h2>Footnotes</h2>
      <ul className="muted">
        {data.footnotes.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
    </article>
  );
}
