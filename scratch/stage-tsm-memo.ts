import { createRequire } from "node:module";
import { SqliteDossierStore } from "../src/db/sqlite-store";
import { stageMemoDelta } from "../src/dossier/memo-store";
import type { SqlDb } from "../src/db/migrate";
const req = createRequire(import.meta.url);
const { DatabaseSync } = req("node:sqlite") as typeof import("node:sqlite");
const db = new DatabaseSync("data/engine.db") as unknown as SqlDb;
db.exec("PRAGMA busy_timeout=8000;");
const store = new SqliteDossierStore(db);
for (const s of store.all()) {
  if (s.status === "done" && s.memo) {
    const id = stageMemoDelta(db, s.symbol, s.memo, s.id);
    console.log(`${s.symbol}: staged version ${id}`);
  }
}
