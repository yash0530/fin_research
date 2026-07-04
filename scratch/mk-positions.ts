import { createRequire } from "node:module";
import { upsertPosition, latestCloseFor } from "../src/db/queries";
import type { SqlDb } from "../src/db/migrate";
const req = createRequire(import.meta.url);
const { DatabaseSync } = req("node:sqlite") as typeof import("node:sqlite");
const db = new DatabaseSync("data/engine.db") as unknown as SqlDb;
db.exec("PRAGMA busy_timeout=8000;");
// Realistic demo: avgCost ~10% above current so P&L is plausible. CLEARED before handoff.
for (const sym of ["MU", "SNDK", "NVDA"]) {
  const c = latestCloseFor(db, sym) ?? 100;
  upsertPosition(db, { symbol: sym, qty: 5, avgCost: Math.round(c * 1.08 * 100) / 100, openedAt: "2026-05-15" });
}
console.log("realistic demo positions set (MU/SNDK/NVDA)");
