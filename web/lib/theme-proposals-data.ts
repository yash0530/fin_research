import type { UserTheme } from "@engine/themes/taxonomy";

interface SqlDb {
  prepare(sql: string): {
    get(...args: unknown[]): Record<string, unknown> | undefined;
    all(...args: unknown[]): Record<string, unknown>[];
    run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  };
  close?: () => void;
}

export interface ThemeProposalRow {
  id: string;
  status: string;
  proposedName: string;
  proposedCode: string;
  rationale: string;
  subthemesJson: string; // [{code, name, sectorCodes[], sampleSymbols[]}]
  evidenceJson: string;  // quotes+accessionNos
  createdAt: string;
  decidedAt: string | null;
}

async function openDb(readOnly = true): Promise<SqlDb | null> {
  try {
    const mod = await import("node:sqlite");
    const file = (process.env.DATABASE_URL ?? "file:../data/engine.db").replace(/^file:/, "");
    const db = new mod.DatabaseSync(file, { readOnly });
    return db as unknown as SqlDb;
  } catch {
    return null;
  }
}

function closeDb(db: SqlDb): void {
  if (typeof db.close === "function") db.close();
}

export async function listPendingProposals(): Promise<ThemeProposalRow[]> {
  const db = await openDb(true);
  if (!db) return [];
  try {
    const rows = db.prepare('SELECT * FROM "ThemeProposal" WHERE "status" = \'PENDING\' ORDER BY "createdAt" DESC').all();
    return rows as unknown as ThemeProposalRow[];
  } catch (e) {
    console.error("Error listing pending proposals:", e);
    return [];
  } finally {
    if (db) closeDb(db);
  }
}

export async function listUserThemes(): Promise<UserTheme[]> {
  const db = await openDb(true);
  if (!db) return [];
  try {
    const rows = db.prepare('SELECT * FROM "UserTheme" ORDER BY "createdAt" DESC').all();
    return rows as unknown as UserTheme[];
  } catch (e) {
    console.error("Error listing user themes:", e);
    return [];
  } finally {
    if (db) closeDb(db);
  }
}

export async function acceptProposal(id: string): Promise<boolean> {
  const db = await openDb(false);
  if (!db) return false;
  try {
    const prop = db.prepare('SELECT * FROM "ThemeProposal" WHERE "id" = ?').get(id) as ThemeProposalRow | undefined;
    if (!prop) throw new Error("Proposal not found");
    if (prop.status !== "PENDING") throw new Error("Proposal is not PENDING");

    db.prepare('BEGIN').run();
    try {
      db.prepare(
        'INSERT INTO "UserTheme" ("code", "name", "subthemesJson", "createdAt") VALUES (?, ?, ?, datetime(\'now\', \'utc\'))'
      ).run(prop.proposedCode, prop.proposedName, prop.subthemesJson);

      db.prepare(
        'UPDATE "ThemeProposal" SET "status" = \'ACCEPTED\', "decidedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?'
      ).run(id);

      db.prepare('COMMIT').run();
      return true;
    } catch (e) {
      db.prepare('ROLLBACK').run();
      throw e;
    }
  } catch (e) {
    console.error("Failed to accept proposal:", e);
    return false;
  } finally {
    closeDb(db);
  }
}

export async function rejectProposal(id: string): Promise<boolean> {
  const db = await openDb(false);
  if (!db) return false;
  try {
    db.prepare(
      'UPDATE "ThemeProposal" SET "status" = \'REJECTED\', "decidedAt" = datetime(\'now\', \'utc\') WHERE "id" = ?'
    ).run(id);
    return true;
  } catch (e) {
    console.error("Failed to reject proposal:", e);
    return false;
  } finally {
    closeDb(db);
  }
}
