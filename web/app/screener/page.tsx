import { runScreen } from "@engine/screener/engine";
import { demoUniverse } from "@/lib/demo";

export default function ScreenerPage() {
  const res = runScreen(demoUniverse(), {
    universe: "ai_infra",
    filters: [{ field: "forwardPE", op: "lt", value: 40 }],
    sort: { field: "marketCap", dir: "desc" },
  });
  return (
    <section>
      <h1>Screener</h1>
      <p className="muted">
        Universe <code>ai_infra</code> · forwardPE &lt; 40 · scanned {res.scanned}, matched{" "}
        {res.matchedCount}
      </p>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Mkt cap ($B)</th>
            <th>Fwd P/E</th>
            <th>Rev growth</th>
          </tr>
        </thead>
        <tbody>
          {res.matched.map((r) => (
            <tr key={r.symbol}>
              <td>{r.symbol}</td>
              <td>{r.marketCap ?? "—"}</td>
              <td>{r.forwardPE ?? "—"}</td>
              <td>{r.revenueGrowthPct != null ? `${r.revenueGrowthPct}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
