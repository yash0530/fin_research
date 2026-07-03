// Commit path for accepted paste-capture items (the contract in this dir's
// CLAUDE.md): every accepted item becomes an EvidenceItem (origin "paste",
// citable as `paste:{captureId}`); tickers we don't know become / bump
// DiscoveryCandidates; dated catalyst items also land in Catalyst (kind
// "event", provenance via the captureId column). All writes in one txn.

import type { SqlDb } from "../db/migrate";
import type { CaptureItem } from "./parse";

export function insertCapture(db: SqlDb, templateKey: string | null, renderedPrompt: string): number {
  const r = db
    .prepare(`INSERT INTO Capture (templateKey, renderedPrompt) VALUES (?, ?)`)
    .run(templateKey, renderedPrompt) as { lastInsertRowid: number | bigint };
  return Number(r.lastInsertRowid);
}

export function setCaptureOutput(db: SqlDb, id: number, rawOutput: string, parseStatus: string): void {
  db.prepare(`UPDATE Capture SET rawOutput = ?, parseStatus = ? WHERE id = ?`).run(rawOutput, parseStatus, id);
}

export type CaptureRow = {
  id: number;
  templateKey: string | null;
  renderedPrompt: string;
  rawOutput: string | null;
  parseStatus: string;
};

export function loadCapture(db: SqlDb, id: number): CaptureRow | null {
  const row = db
    .prepare(`SELECT id, templateKey, renderedPrompt, rawOutput, parseStatus FROM Capture WHERE id = ?`)
    .get(id) as CaptureRow | undefined;
  return row ?? null;
}

export type CommitSummary = { evidence: number; discoveries: number; catalysts: number };

export function commitCapture(db: SqlDb, captureId: number, items: CaptureItem[]): CommitSummary {
  const summary: CommitSummary = { evidence: 0, discoveries: 0, catalysts: 0 };
  if (items.length === 0) return summary;

  const known = db.prepare(`SELECT 1 AS one FROM Ticker WHERE symbol = ?`);
  const ev = db.prepare(
    `INSERT INTO EvidenceItem (origin, kind, symbol, text, confidence, asOf, captureId)
     VALUES ('paste', ?, ?, ?, ?, ?, ?)`,
  );
  const disc = db.prepare(
    `INSERT INTO DiscoveryCandidate (symbol, source, note) VALUES (?, 'paste', ?)
     ON CONFLICT(symbol) DO UPDATE SET occurrences = occurrences + 1, lastSeen = CURRENT_TIMESTAMP`,
  );
  const cat = db.prepare(
    `INSERT INTO Catalyst (d, kind, symbol, title, captureId) VALUES (?, 'event', ?, ?, ?)`,
  );

  db.exec("BEGIN");
  try {
    for (const it of items) {
      const symbol = it.ticker ? it.ticker.trim().toUpperCase() : null;
      ev.run(it.kind, symbol, it.text, it.confidence ?? null, it.asOf ?? null, captureId);
      summary.evidence++;
      if (symbol && !known.get(symbol)) {
        disc.run(symbol, it.text.slice(0, 120));
        summary.discoveries++;
      }
      if (it.kind === "catalyst" && it.asOf) {
        cat.run(it.asOf, symbol, it.text.slice(0, 160), captureId);
        summary.catalysts++;
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return summary;
}
