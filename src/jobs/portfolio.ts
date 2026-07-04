import type { SqlDb } from "../db/migrate";
import { listPositions, latestRecCallFor } from "../db/queries";
import { decaySignals } from "../portfolio/decay";
import { despike } from "../lib/metrics";

export async function runPortfolioCheck(db: SqlDb): Promise<string> {
  const positions = listPositions(db);
  const details: string[] = [];

  for (const pos of positions) {
    try {
      const rows = db
        .prepare('SELECT "d", "close" FROM "Price" WHERE "symbol"=? ORDER BY "d" ASC')
        .all(pos.symbol.toUpperCase()) as { d: string; close: number }[];
      const rawCloses = rows.map((r) => r.close);
      const cleaned = despike(rawCloses);
      const closes = rows.map((r, i) => ({ d: r.d, close: cleaned[i] }));
      const currentPrice = closes.length > 0 ? closes[closes.length - 1].close : null;
      
      const recCall = latestRecCallFor(db, pos.symbol);

      const findings = decaySignals({
        symbol: pos.symbol,
        currentPrice,
        avgCost: pos.avgCost,
        closes,
        recCall,
      });

      // Filter critical and warn findings
      const criticalOrWarn = findings.filter(
        (f) => f.severity === "critical" || f.severity === "warn",
      );

      for (const finding of criticalOrWarn) {
        if (finding.kind === "stop_breach") {
          details.push(`⚠ ${pos.symbol} stop_breach @ ${currentPrice}`);
        } else if (finding.kind === "drawdown") {
          details.push(finding.message);
        }
      }
    } catch (err) {
      // catch-per-item: never throw
    }
  }

  const countStr = `${positions.length} position${positions.length === 1 ? "" : "s"}`;
  if (details.length > 0) {
    return `${countStr}; ${details.join("; ")}`;
  }
  return countStr;
}

