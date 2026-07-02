-- CreateTable
CREATE TABLE "Sector" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "taxonomy" TEXT NOT NULL DEFAULT 'gics',
    "driver" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'early',
    "note" TEXT
);

-- CreateTable
CREATE TABLE "StageHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sectorCode" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "ratedBy" TEXT NOT NULL,
    "rationale" TEXT,
    "ratedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageHistory_sectorCode_fkey" FOREIGN KEY ("sectorCode") REFERENCES "Sector" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ticker" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "class" TEXT NOT NULL DEFAULT 'stock',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'seed',
    "watchlisted" BOOLEAN NOT NULL DEFAULT false,
    "cik" TEXT,
    "marketCap" REAL,
    "forwardPE" REAL,
    "trailingPE" REAL,
    "profitMargin" REAL,
    "revenueGrowth" REAL,
    "fiftyTwoWeekHigh" REAL,
    "fiftyTwoWeekLow" REAL,
    "beta" REAL,
    "eps" REAL,
    "yearChange" REAL,
    "statsUpdatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "TickerSector" (
    "symbol" TEXT NOT NULL,
    "sectorCode" TEXT NOT NULL,

    PRIMARY KEY ("symbol", "sectorCode"),
    CONSTRAINT "TickerSector_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TickerSector_sectorCode_fkey" FOREIGN KEY ("sectorCode") REFERENCES "Sector" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Price" (
    "symbol" TEXT NOT NULL,
    "d" TEXT NOT NULL,
    "close" REAL NOT NULL,
    "volume" REAL,

    PRIMARY KEY ("symbol", "d")
);

-- CreateTable
CREATE TABLE "FundamentalsQuarter" (
    "symbol" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "revenue" REAL,
    "grossProfit" REAL,
    "operatingIncome" REAL,
    "netIncome" REAL,
    "fcf" REAL,
    "capex" REAL,
    "totalAssets" REAL,
    "totalDebt" REAL,
    "cash" REAL,
    "equity" REAL,
    "sharesOut" REAL,

    PRIMARY KEY ("symbol", "periodEnd")
);

-- CreateTable
CREATE TABLE "EdgarFiling" (
    "accessionNo" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "cik" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "filedAt" DATETIME NOT NULL,
    "primaryDoc" TEXT
);

-- CreateTable
CREATE TABLE "BackfillProgress" (
    "task" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rows" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("task", "symbol")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "urlHash" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "snippet" TEXT,
    "source" TEXT,
    "sectorCode" TEXT,
    "symbol" TEXT,
    "publishedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Catalyst" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "d" TEXT,
    "kind" TEXT NOT NULL,
    "sectorCode" TEXT,
    "symbol" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "captureId" INTEGER
);

-- CreateTable
CREATE TABLE "ManualSeries" (
    "series" TEXT NOT NULL,
    "d" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "note" TEXT,

    PRIMARY KEY ("series", "d")
);

-- CreateTable
CREATE TABLE "Digest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "d" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataJson" TEXT NOT NULL,
    "llmMd" TEXT,
    "llmProvider" TEXT,
    "llmModel" TEXT
);

-- CreateTable
CREATE TABLE "ToolCacheEntry" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "tool" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "sourcesJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ScreenerConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "universe" TEXT NOT NULL,
    "filtersJson" TEXT NOT NULL,
    "sortJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DiscoveryCandidate" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "Dossier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "sectorCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "requestedBy" TEXT NOT NULL DEFAULT 'user',
    "budgetJson" TEXT,
    "spentJson" TEXT,
    "verdictJson" TEXT,
    "reportJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DossierStage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dossierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outputJson" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DossierStage_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ToolCall" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dossierId" TEXT,
    "tool" TEXT NOT NULL,
    "argsJson" TEXT,
    "resultJson" TEXT,
    "sourcesJson" TEXT,
    "confidence" TEXT,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolCall_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Memo" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "contentJson" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MemoVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentJson" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'staged',
    "deltaSummary" TEXT,
    "sourceDossierId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "origin" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "symbol" TEXT,
    "sectorCode" TEXT,
    "text" TEXT NOT NULL,
    "refsJson" TEXT,
    "confidence" TEXT,
    "asOf" TEXT,
    "captureId" INTEGER,
    "dossierId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RecCall" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dossierId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "conviction" TEXT NOT NULL,
    "priceAtCall" REAL NOT NULL,
    "targetLow" REAL,
    "targetHigh" REAL,
    "stopPrice" REAL,
    "judgeSizePct" REAL NOT NULL,
    "governedSizePct" REAL NOT NULL,
    "governorReason" TEXT,
    "model" TEXT,
    "thinkingMode" BOOLEAN NOT NULL DEFAULT false,
    "wwcmJson" TEXT,
    "outcome1mPct" REAL,
    "outcome3mPct" REAL,
    "outcome6mPct" REAL,
    "outcome1yPct" REAL,
    "thesisFalsified" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StoryPage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dossierId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "storyJson" TEXT NOT NULL,
    "narrativeJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BuyList" (
    "month" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "capitalUsd" REAL NOT NULL DEFAULT 2500,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BuyListItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "buyListMonth" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "dossierId" TEXT,
    "symbol" TEXT NOT NULL,
    "plannedUsd" REAL NOT NULL,
    "governedSizePct" REAL,
    "governorReason" TEXT,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "actualUsd" REAL,
    "actualPrice" REAL,
    "executedAt" DATETIME,
    CONSTRAINT "BuyListItem_buyListMonth_fkey" FOREIGN KEY ("buyListMonth") REFERENCES "BuyList" ("month") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Capture" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "templateKey" TEXT,
    "renderedPrompt" TEXT NOT NULL,
    "rawOutput" TEXT,
    "parseStatus" TEXT NOT NULL DEFAULT 'empty',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "thesis" TEXT NOT NULL,
    "invalidation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Position" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "qty" REAL NOT NULL,
    "avgCost" REAL NOT NULL,
    "openedAt" TEXT
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "job" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "detail" TEXT
);

-- CreateIndex
CREATE INDEX "StageHistory_sectorCode_ratedAt_idx" ON "StageHistory"("sectorCode", "ratedAt");

-- CreateIndex
CREATE INDEX "Ticker_watchlisted_idx" ON "Ticker"("watchlisted");

-- CreateIndex
CREATE INDEX "TickerSector_sectorCode_idx" ON "TickerSector"("sectorCode");

-- CreateIndex
CREATE INDEX "Price_d_idx" ON "Price"("d");

-- CreateIndex
CREATE INDEX "FundamentalsQuarter_symbol_idx" ON "FundamentalsQuarter"("symbol");

-- CreateIndex
CREATE INDEX "EdgarFiling_symbol_form_idx" ON "EdgarFiling"("symbol", "form");

-- CreateIndex
CREATE INDEX "NewsItem_sectorCode_fetchedAt_idx" ON "NewsItem"("sectorCode", "fetchedAt");

-- CreateIndex
CREATE INDEX "NewsItem_fetchedAt_idx" ON "NewsItem"("fetchedAt");

-- CreateIndex
CREATE INDEX "Catalyst_d_idx" ON "Catalyst"("d");

-- CreateIndex
CREATE INDEX "Digest_createdAt_idx" ON "Digest"("createdAt");

-- CreateIndex
CREATE INDEX "ToolCacheEntry_tool_idx" ON "ToolCacheEntry"("tool");

-- CreateIndex
CREATE INDEX "Dossier_status_priority_idx" ON "Dossier"("status", "priority");

-- CreateIndex
CREATE INDEX "Dossier_symbol_idx" ON "Dossier"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "DossierStage_dossierId_name_key" ON "DossierStage"("dossierId", "name");

-- CreateIndex
CREATE INDEX "ToolCall_dossierId_idx" ON "ToolCall"("dossierId");

-- CreateIndex
CREATE INDEX "MemoVersion_symbol_version_idx" ON "MemoVersion"("symbol", "version");

-- CreateIndex
CREATE INDEX "EvidenceItem_symbol_createdAt_idx" ON "EvidenceItem"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceItem_origin_createdAt_idx" ON "EvidenceItem"("origin", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecCall_dossierId_key" ON "RecCall"("dossierId");

-- CreateIndex
CREATE INDEX "RecCall_symbol_createdAt_idx" ON "RecCall"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "RecCall_conviction_idx" ON "RecCall"("conviction");

-- CreateIndex
CREATE UNIQUE INDEX "StoryPage_dossierId_key" ON "StoryPage"("dossierId");

-- CreateIndex
CREATE INDEX "StoryPage_symbol_idx" ON "StoryPage"("symbol");

-- CreateIndex
CREATE INDEX "BuyListItem_buyListMonth_idx" ON "BuyListItem"("buyListMonth");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_key_key" ON "PromptTemplate"("key");

-- CreateIndex
CREATE INDEX "JournalEntry_symbol_createdAt_idx" ON "JournalEntry"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt");

