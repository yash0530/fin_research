import { buildBuyList } from "@engine/buylist/build";
import { demoCandidates, AS_OF } from "@/lib/demo";

export default function BuyListPage() {
  const list = buildBuyList(demoCandidates(), { capitalUsd: 2500, minLotUsd: 100, maxAgeDays: 45 });
  return (
    <section>
      <h1>
        Buy list <span className="muted">· {AS_OF}</span>
      </h1>
      <p className="muted">
        ${list.capitalUsd.toLocaleString()} capital · deployed ${list.deployedUsd.toLocaleString()} ·
        cash ${list.cashUsd.toLocaleString()}. Sizes are governed — unproven tiers cap at 2%.
      </p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Symbol</th>
            <th>Conviction</th>
            <th>Size %</th>
            <th>Planned $</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {list.items.map((i) => (
            <tr key={i.symbol}>
              <td>{i.rank}</td>
              <td>{i.symbol}</td>
              <td>{i.conviction}</td>
              <td>{i.effectiveSizePct}%</td>
              <td>{i.skipped ? <span className="muted">skipped (&lt; lot)</span> : `$${i.plannedUsd}`}</td>
              <td className="evidence">{i.governorReason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="disclaimer">You log actual buys in your own brokerage — ENGINE never executes.</p>
    </section>
  );
}
