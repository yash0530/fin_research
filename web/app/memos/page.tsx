import Link from "next/link";
import { memoIndex, stagedOnlySymbols } from "../../lib/memo-data";

export const dynamic = "force-dynamic";

export default async function MemosIndexPage() {
  const [active, stagedOnly] = await Promise.all([memoIndex(), stagedOnlySymbols()]);

  return (
    <section>
      <h1>Living Memos</h1>
      <p className="muted">
        Per-ticker distilled knowledge. Each dossier stages a memo delta; you apply or
        reject it (the engine proposes, a human decides). Applied memos carry forward
        into future dives, so knowledge compounds instead of restarting.
      </p>

      {stagedOnly.length > 0 && (
        <>
          <h2>Awaiting first review</h2>
          <ul className="memo-list">
            {stagedOnly.map((s) => (
              <li key={s.symbol}>
                <Link href={`/memos/${s.symbol}`}>{s.symbol}</Link>{" "}
                <span className="chip chip-hold">{s.stagedCount} staged</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Active memos</h2>
      {active.length === 0 ? (
        <p className="muted">
          No memos applied yet. Run a dossier (<code>npm run job -- dossier --symbols=MU</code>), then
          review its staged delta here.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Version</th>
              <th>Updated</th>
              <th>Staged</th>
            </tr>
          </thead>
          <tbody>
            {active.map((m) => (
              <tr key={m.symbol}>
                <td>
                  <Link href={`/memos/${m.symbol}`}>{m.symbol}</Link>
                </td>
                <td className="num">v{m.version}</td>
                <td className="muted">{String(m.updatedAt).slice(0, 10)}</td>
                <td>{m.stagedCount > 0 ? <span className="chip chip-hold">{m.stagedCount}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
