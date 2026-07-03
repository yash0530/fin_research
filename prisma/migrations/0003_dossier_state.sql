-- _dossier_state: the durable DossierStore's self-managed table (JSON blob per
-- dossier → survives a daemon restart and resumes). It mirrors the runtime guard
-- in src/db/sqlite-store.ts EXACTLY (CREATE IF NOT EXISTS), so applying this on a
-- DB where the store already ran is a no-op. Additive only.
--
-- Like `_migrations`, this is an INTERNAL engine table (leading underscore), not a
-- Prisma-managed domain model — it is deliberately absent from schema.prisma
-- (Prisma cannot own an underscore-prefixed table), same convention as `_migrations`.
CREATE TABLE IF NOT EXISTS "_dossier_state" (
  "id" TEXT PRIMARY KEY,
  "symbol" TEXT,
  "status" TEXT,
  "json" TEXT NOT NULL,
  "updatedAt" INTEGER
);

CREATE INDEX IF NOT EXISTS "_dossier_state_status_updatedAt_idx" ON "_dossier_state"("status","updatedAt");
