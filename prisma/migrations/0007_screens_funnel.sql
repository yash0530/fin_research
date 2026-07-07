-- Create Candidate table
CREATE TABLE "Candidate" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "tier" INTEGER NOT NULL,
    "triggerTags" TEXT NOT NULL, -- JSON array
    "qualification" TEXT NOT NULL, -- JSON
    "computedAt" TEXT NOT NULL,
    "userState" TEXT NOT NULL DEFAULT 'INBOX' CHECK ("userState" IN ('INBOX', 'WATCHLIST', 'PORTFOLIO', 'ARCHIVED'))
);

-- Create WatchlistEntry table
CREATE TABLE "WatchlistEntry" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "userLocked" INTEGER NOT NULL DEFAULT 1,
    "buyUnder" REAL,
    "valueBase" REAL,
    "valueLow" REAL,
    "valueHigh" REAL,
    "thesis" TEXT,
    "disconfirming" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
);

-- Create DecisionSnapshot table
CREATE TABLE "DecisionSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "payload" TEXT NOT NULL -- JSON
);
