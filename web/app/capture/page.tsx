import { renderPrompt } from "@engine/capture/render";
import { AS_OF, demoUniverse } from "@/lib/demo";

export default function CapturePage() {
  const watchlist = demoUniverse()
    .filter((r) => r.watchlisted)
    .map((r) => r.symbol);
  const prompt = renderPrompt("daily_scan", { asOf: AS_OF, watchlist });

  return (
    <section>
      <h1>Capture</h1>
      <p className="muted">
        The $0 web-research lane: copy the rendered prompt → paste into
        Perplexity/Claude/ChatGPT → paste the reply back to parse into typed evidence.
      </p>
      <h2>Rendered prompt (daily scan)</h2>
      <pre className="panel" style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>
        {prompt}
      </pre>
    </section>
  );
}
