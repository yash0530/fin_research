import { type SqlDb } from "../db/migrate";

export type CreateRunOpts = {
  id?: string;
  runType: string;
  target: string;
  budgetSeconds: number;
  profile: string;
};

/**
 * Creates a new ResearchRun in the database and returns its run ID.
 */
export function createResearchRun(db: SqlDb, opts: CreateRunOpts): string {
  const id =
    opts.id ??
    `run_${new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`;

  db.prepare(
    'INSERT INTO "ResearchRun" ("id", "runType", "target", "budgetSeconds", "status", "profile", "createdAt") VALUES (?, ?, ?, ?, \'PENDING\', ?, datetime(\'now\', \'utc\'))'
  ).run(id, opts.runType, opts.target, opts.budgetSeconds, opts.profile);

  return id;
}
