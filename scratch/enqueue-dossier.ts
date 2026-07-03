// Ops probe: enqueue a dossier WITHOUT running it, so the scheduler daemon's
// idle-drain path picks it up autonomously. Run: npx tsx scratch/enqueue-dossier.ts SYMBOL
import { createRequire } from "node:module";
import { SqliteDossierStore } from "../src/db/sqlite-store";
import { enqueueDossier } from "../src/dossier/queue";
import type { SqlDb } from "../src/db/migrate";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

const symbol = (process.argv[2] ?? "").toUpperCase();
if (!symbol) {
  console.error("usage: npx tsx scratch/enqueue-dossier.ts SYMBOL");
  process.exit(1);
}
const db = new DatabaseSync("data/engine.db") as unknown as SqlDb;
db.exec("PRAGMA busy_timeout=8000;");
const store = new SqliteDossierStore(db);
console.log("enqueue:", JSON.stringify(enqueueDossier(store, symbol)));
