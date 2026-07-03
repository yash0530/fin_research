interface SqlDb {
  prepare(sql: string): {
    get(...args: unknown[]): Record<string, unknown> | undefined;
    all(...args: unknown[]): Record<string, unknown>[];
  };
  close?: () => void;
}

async function openDb(): Promise<SqlDb | null> {
  try {
    const mod = await import("node:sqlite");
    const file = (
      process.env.DATABASE_URL ?? "file:../data/engine.db"
    ).replace(/^file:/, "");
    const db = new mod.DatabaseSync(file, { readOnly: true });
    return db as unknown as SqlDb;
  } catch {
    return null;
  }
}

function closeDb(db: SqlDb): void {
  if (typeof db.close === "function") db.close();
}

export interface RuleEventRow {
  id: number;
  ruleId: string;
  firedAt: string;
  severity: string;
  message: string;
  acked: boolean;
}

/** Return all RuleEvent rows newest-first. */
export async function listRuleEvents(): Promise<RuleEventRow[]> {
  const db = await openDb();
  if (!db) return [];

  try {
    const rows = db.prepare(`
      SELECT id, ruleId, firedAt, severity, message, acked
      FROM RuleEvent
      ORDER BY firedAt DESC, id DESC
    `).all();

    return rows.map((r) => ({
      id: r.id as number,
      ruleId: r.ruleId as string,
      firedAt: r.firedAt as string,
      severity: r.severity as string,
      message: r.message as string,
      acked: (r.acked as number) === 1,
    }));
  } catch (err) {
    console.error("Error in listRuleEvents:", err);
    return [];
  } finally {
    closeDb(db);
  }
}
