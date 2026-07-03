-- RuleEvent: tripwire fires (signals, never pages). Matches the runtime guard in
-- src/db/queries.ts exactly (CREATE IF NOT EXISTS), so applying this migration on
-- a DB where the guard already ran is a no-op. Additive only.
CREATE TABLE IF NOT EXISTS "RuleEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "ruleId" TEXT NOT NULL,
  "firedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "severity" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "acked" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "RuleEvent_ruleId_firedAt_idx" ON "RuleEvent"("ruleId","firedAt");
