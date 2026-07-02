import { synthesize } from "@engine/research/synthesize";
import { demoSynthInput } from "@/lib/demo";
import { InsightList } from "@/components/InsightList";

export default function Home() {
  const digest = synthesize(demoSynthInput());
  return (
    <section>
      <h1>
        Morning digest <span className="muted">· {digest.asOf}</span>
      </h1>
      <div className="panel">
        <strong>{digest.headline}</strong>
        <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
          {(digest.counts.critical ?? 0)} critical · {(digest.counts.warn ?? 0)} warn ·{" "}
          {(digest.counts.info ?? 0)} info — every line carries its evidence.
        </div>
      </div>
      <InsightList insights={digest.insights} />
    </section>
  );
}
