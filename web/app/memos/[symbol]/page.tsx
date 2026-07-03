import Link from "next/link";
import { memoVersionsFor, MEMO_SECTIONS, type MemoVersionRow } from "../../../lib/memo-data";
import MemoReview from "../MemoReview";

export const dynamic = "force-dynamic";

const SECTION_LABEL: Record<string, string> = {
  identity: "Identity",
  moat: "Moat",
  long_term_thesis: "Long-term thesis",
  current_state: "Current state",
  management_track_record: "Management track record",
  risk_register: "Risk register",
  open_questions: "Open questions",
  recent_observations: "Recent observations",
  past_verdicts: "Past verdicts",
  anti_thesis: "Anti-thesis",
};

function MemoBody({ content }: { content: Record<string, string> }) {
  return (
    <div className="memo-body">
      {MEMO_SECTIONS.map((s) => (
        <div key={s} className="memo-section">
          <h4>{SECTION_LABEL[s] ?? s}</h4>
          <p className={content[s]?.trim() ? "" : "muted"}>{content[s]?.trim() || "—"}</p>
        </div>
      ))}
    </div>
  );
}

export default async function MemoDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase();
  const versions = await memoVersionsFor(sym);
  const active = versions.find((v) => v.state === "active");
  const staged = versions.filter((v) => v.state === "staged");
  const history = versions.filter((v) => v.state === "superseded" || v.state === "rejected");

  if (versions.length === 0) {
    return (
      <section>
        <h1>{sym} — Living Memo</h1>
        <p className="muted">
          No memo yet. Run a dossier (<code>npm run job -- dossier --symbols={sym}</code>) and its memo delta
          will appear here for review.
        </p>
        <p>
          <Link href="/memos">← All memos</Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1>
        {sym} — Living Memo <Link href={`/tickers/${sym}`} className="muted">(cockpit →)</Link>
      </h1>

      {staged.length > 0 && (
        <>
          <h2>Staged for review</h2>
          {staged.map((v: MemoVersionRow) => (
            <div key={v.id} className="card memo-staged">
              <div className="memo-staged-head">
                <strong>v{v.version} staged</strong>
                {v.deltaSummary && <span className="muted"> — {v.deltaSummary}</span>}
                {v.sourceDossierId && (
                  <Link href={`/dossiers/${v.sourceDossierId}`} className="muted">
                    {" "}
                    (from dossier)
                  </Link>
                )}
                <MemoReview versionId={v.id} symbol={sym} />
              </div>
              <MemoBody content={v.content} />
            </div>
          ))}
        </>
      )}

      <h2>{active ? `Active (v${active.version})` : "No active version yet"}</h2>
      {active ? <MemoBody content={active.content} /> : <p className="muted">Apply a staged version to make it active.</p>}

      {history.length > 0 && (
        <>
          <h2>History</h2>
          <ul className="memo-list">
            {history.map((v) => (
              <li key={v.id}>
                <span className="num">v{v.version}</span> <span className="muted">{v.state}</span>
                {v.deltaSummary && <span className="muted"> — {v.deltaSummary}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <p>
        <Link href="/memos">← All memos</Link>
      </p>
    </section>
  );
}
