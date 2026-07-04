import { createRequire } from "node:module";
import { latestCloseFor, latestRecCallFor, listPositions } from "../src/db/queries";
import { positionView } from "../src/portfolio/decay";
import type { SqlDb } from "../src/db/migrate";
const req = createRequire(import.meta.url);
const { DatabaseSync } = req("node:sqlite") as typeof import("node:sqlite");
const db = new DatabaseSync("data/engine.db") as unknown as SqlDb;
for (const p of listPositions(db)) {
  const cp = latestCloseFor(db, p.symbol);
  console.log(p.symbol, "qty", p.qty, "avgCost", p.avgCost, "latestClose", cp, "→ view:", JSON.stringify(positionView(p, cp)));
}
