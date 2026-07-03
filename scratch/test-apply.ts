import { createRequire } from "node:module";
import { applyMemoVersion, loadActiveMemo } from "../src/dossier/memo-store";
import type { SqlDb } from "../src/db/migrate";
const req = createRequire(import.meta.url);
const { DatabaseSync } = req("node:sqlite") as typeof import("node:sqlite");
const db = new DatabaseSync("data/engine.db") as unknown as SqlDb;
db.exec("PRAGMA busy_timeout=8000;");
const v = db.prepare("SELECT id FROM MemoVersion WHERE symbol='TSM' AND state='staged'").get() as {id:number}|undefined;
if (!v) { console.log("no staged TSM version"); process.exit(0); }
console.log("applying version", v.id);
console.log("applied:", applyMemoVersion(db, v.id));
const active = loadActiveMemo(db, "TSM");
console.log("active memo sections filled:", Object.entries(active ?? {}).filter(([,x])=>x.trim()).map(([k])=>k));
console.log("Memo head:", db.prepare("SELECT version FROM Memo WHERE symbol='TSM'").get());
