import { createRequire } from "node:module";
import { buildProductionRegistry } from "../src/tools/factory";
import type { SqlDb } from "../src/db/migrate";
const req = createRequire(import.meta.url);
const { DatabaseSync } = req("node:sqlite") as typeof import("node:sqlite");
const db = new DatabaseSync("data/engine.db") as unknown as SqlDb;
db.exec("PRAGMA busy_timeout=8000;");
const reg = buildProductionRegistry(db, {} as never);
const tool = reg.get("qoe");
(async () => {
  const r = await tool!.run({ ticker: "MU" });
  const d = r.data as Record<string, unknown>;
  console.log("confidence:", r.confidence, "| data_status:", d.data_status);
  console.log("altmanZ:", d.altmanZ, "| zone:", d.altmanZone);
  console.log("beneishM:", d.beneishM, "| flag:", d.beneishFlag);
  console.log("piotroskiF:", d.piotroskiF);
  console.log("accrualRatio:", d.accrualRatio);
})();
