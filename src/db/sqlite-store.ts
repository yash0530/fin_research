import type { SqlDb } from "./migrate";
import type { DossierState, DossierStore } from "../dossier/state";

// A DossierStore backed by SQLite (via the injectable SqlDb — same interface the
// migration runner uses, so it's tested with Node's node:sqlite). Persists the
// DossierState as JSON in a self-managed table; this is what lets a dossier
// survive a daemon restart and resume. The InMemoryDossierStore is the test
// double; this is the durable one.

export class SqliteDossierStore implements DossierStore {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS _dossier_state (id TEXT PRIMARY KEY, symbol TEXT, status TEXT, json TEXT NOT NULL, updatedAt INTEGER)",
    );
  }

  load(id: string): DossierState | undefined {
    const row = this.db.prepare("SELECT json FROM _dossier_state WHERE id = ?").get(id) as
      | { json: string }
      | undefined;
    return row ? (JSON.parse(row.json) as DossierState) : undefined;
  }

  save(state: DossierState): void {
    this.db
      .prepare(
        "INSERT INTO _dossier_state (id, symbol, status, json, updatedAt) VALUES (?,?,?,?,?) " +
          "ON CONFLICT(id) DO UPDATE SET symbol=excluded.symbol, status=excluded.status, json=excluded.json, updatedAt=excluded.updatedAt",
      )
      .run(state.id, state.symbol, state.status, JSON.stringify(state), state.updatedAt);
  }

  all(): DossierState[] {
    const rows = this.db.prepare("SELECT json FROM _dossier_state ORDER BY updatedAt").all() as {
      json: string;
    }[];
    return rows.map((r) => JSON.parse(r.json) as DossierState);
  }
}
