import { createRequire } from "node:module";
import type { SqlDb } from "../src/db/migrate";
const req = createRequire(import.meta.url);
const { DatabaseSync } = req("node:sqlite") as typeof import("node:sqlite");
const db = new DatabaseSync("data/engine.db") as unknown as SqlDb;
const rows = db.prepare('SELECT COUNT(*) AS n FROM "FundamentalsQuarter" WHERE symbol=?').get("MU") as {n:number};
console.log("MU fundamentals rows:", rows.n);
const cons = db.prepare('SELECT periodEnd, cfo, sga, receivables FROM "FundamentalsQuarter" WHERE symbol=? AND cfo IS NOT NULL ORDER BY periodEnd DESC LIMIT 10').all("MU");
console.log("recent deep quarters:", cons.length, JSON.stringify(cons.slice(0,3)));
