import CaptureFlow from "./CaptureFlow";

export const dynamic = "force-dynamic";

export default function CapturePage() {
  return (
    <section>
      <h1>Capture</h1>
      <p className="muted">
        The $0 web-research lane: render a data-grounded prompt → copy into
        Perplexity/Claude/ChatGPT → paste the reply back → review the parsed items →
        commit. Accepted items become evidence (citable in dossiers as{" "}
        <code>paste:&#123;id&#125;</code>), discovery candidates, and dated catalysts.
      </p>
      <CaptureFlow />
    </section>
  );
}
