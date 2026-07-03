-- StoryPage: the flagship editorial page per dossier (frozen storyJson + optional
-- Qwen narrativeJson). Matches the runtime guard in src/db/queries.saveStoryPage
-- exactly, so applying where the guard already ran is a no-op. Additive only.
CREATE TABLE IF NOT EXISTS "StoryPage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dossierId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "storyJson" TEXT NOT NULL,
    "narrativeJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoryPage_dossierId_key" ON "StoryPage"("dossierId");
CREATE INDEX IF NOT EXISTS "StoryPage_symbol_idx" ON "StoryPage"("symbol");
