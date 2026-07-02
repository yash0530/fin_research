import { demoDossiers } from "@/lib/demo";

export default function DossiersPage() {
  return (
    <section>
      <h1>Dossiers</h1>
      <p className="muted">Queued deep-dive debates. Each ends in a governed, citation-checked verdict.</p>
      {demoDossiers.map((d) => (
        <div className="panel" key={d.id}>
          <div>
            <strong>{d.symbol}</strong> <span className="badge">{d.status}</span>{" "}
            {d.action ? (
              <span className="sev-info">
                {d.action} / {d.conviction}
              </span>
            ) : null}
          </div>
          {d.summary ? <div className="muted" style={{ marginTop: "0.25rem" }}>{d.summary}</div> : null}
          {d.action === "BUY" ? (
            <div style={{ marginTop: "0.4rem" }}>
              <a href={`/story/${d.symbol.toLowerCase()}`}>View story page →</a>
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
