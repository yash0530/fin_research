// Living-Memo store: the distillation-over-RAG loop. A dossier's memo-synth stage
// produces a delta (section → new prose); we STAGE it as a MemoVersion (never
// auto-applied — human-gated, matching the sector-stage discipline). A human then
// applies (staged → active, bump the Memo head, supersede the prior active) or
// rejects (staged → rejected). The active Memo is what future dossiers read as
// `memoSummary`, so applied knowledge compounds across dives.

import type { SqlDb } from "../db/migrate";
import { MEMO_SECTIONS } from "./prompts/memo";
import type { MemoDelta } from "./schemas";

export type MemoContent = Record<string, string>;
export type MemoVersionState = "staged" | "active" | "superseded" | "rejected";

export type MemoVersionRow = {
  id: number;
  symbol: string;
  version: number;
  contentJson: string;
  state: MemoVersionState;
  deltaSummary: string | null;
  sourceDossierId: string | null;
  createdAt: string;
};

/** Empty 10-section scaffold — the shape every memo conforms to. */
export function emptyMemo(): MemoContent {
  const m: MemoContent = {};
  for (const s of MEMO_SECTIONS) m[s] = "";
  return m;
}

export function loadActiveMemo(db: SqlDb, symbol: string): MemoContent | null {
  const row = db
    .prepare('SELECT "contentJson" FROM "Memo" WHERE "symbol"=?')
    .get(symbol.toUpperCase()) as { contentJson: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.contentJson) as MemoContent;
  } catch {
    return null;
  }
}

/** Merge a dossier's delta onto the current active memo → a new staged MemoVersion.
 *  Non-empty delta sections overwrite; untouched sections carry forward. Returns the
 *  staged version id, or null when the delta has no usable content. */
export function stageMemoDelta(
  db: SqlDb,
  symbol: string,
  delta: MemoDelta,
  sourceDossierId: string,
  now: () => number = Date.now,
): number | null {
  const sym = symbol.toUpperCase();
  const base = loadActiveMemo(db, sym) ?? emptyMemo();
  const merged: MemoContent = { ...emptyMemo(), ...base };
  let changed = 0;
  for (const [section, text] of Object.entries(delta.sections ?? {})) {
    if (!MEMO_SECTIONS.includes(section as (typeof MEMO_SECTIONS)[number])) continue;
    const t = (text ?? "").trim();
    if (t && t !== (merged[section] ?? "").trim()) {
      merged[section] = t;
      changed++;
    }
  }
  if (changed === 0) return null; // narration added nothing new — don't stage noise

  const nextVersion =
    ((db.prepare('SELECT MAX("version") AS v FROM "MemoVersion" WHERE "symbol"=?').get(sym) as { v: number | null })
      ?.v ?? 0) + 1;
  const r = db
    .prepare(
      'INSERT INTO "MemoVersion" ("symbol","version","contentJson","state","deltaSummary","sourceDossierId","createdAt") ' +
        "VALUES (?,?,?,'staged',?,?,?)",
    )
    .run(
      sym,
      nextVersion,
      JSON.stringify(merged),
      delta.delta_summary || null,
      sourceDossierId,
      new Date(now()).toISOString(),
    ) as { lastInsertRowid: number | bigint };
  return Number(r.lastInsertRowid);
}

/** Apply a staged version: it becomes active, the Memo head is updated, and the
 *  previously-active version is superseded. Idempotent-safe: a non-staged id is a
 *  no-op returning false. */
export function applyMemoVersion(db: SqlDb, versionId: number, now: () => number = Date.now): boolean {
  const v = db
    .prepare('SELECT "id","symbol","version","contentJson","state" FROM "MemoVersion" WHERE "id"=?')
    .get(versionId) as Pick<MemoVersionRow, "id" | "symbol" | "version" | "contentJson" | "state"> | undefined;
  if (!v || v.state !== "staged") return false;
  const ts = new Date(now()).toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE \"MemoVersion\" SET \"state\"='superseded' WHERE \"symbol\"=? AND \"state\"='active'").run(
      v.symbol,
    );
    db.prepare("UPDATE \"MemoVersion\" SET \"state\"='active' WHERE \"id\"=?").run(versionId);
    db.prepare(
      'INSERT INTO "Memo" ("symbol","contentJson","version","updatedAt") VALUES (?,?,?,?) ' +
        'ON CONFLICT("symbol") DO UPDATE SET "contentJson"=excluded."contentJson", "version"=excluded."version", "updatedAt"=excluded."updatedAt"',
    ).run(v.symbol, v.contentJson, v.version, ts);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return true;
}

export function rejectMemoVersion(db: SqlDb, versionId: number): boolean {
  const r = db
    .prepare("UPDATE \"MemoVersion\" SET \"state\"='rejected' WHERE \"id\"=? AND \"state\"='staged'")
    .run(versionId) as { changes: number | bigint };
  return Number(r.changes) > 0;
}

export function listMemoVersions(db: SqlDb, symbol: string): MemoVersionRow[] {
  return db
    .prepare('SELECT * FROM "MemoVersion" WHERE "symbol"=? ORDER BY "version" DESC')
    .all(symbol.toUpperCase()) as MemoVersionRow[];
}

export function stagedMemoVersions(db: SqlDb): MemoVersionRow[] {
  return db
    .prepare("SELECT * FROM \"MemoVersion\" WHERE \"state\"='staged' ORDER BY \"createdAt\" DESC")
    .all() as MemoVersionRow[];
}
