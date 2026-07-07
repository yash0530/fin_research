-- CreateTable
CREATE TABLE "InsiderTx" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "filerName" TEXT NOT NULL,
    "filerRole" TEXT NOT NULL,
    "txDate" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shares" REAL NOT NULL,
    "price" REAL NOT NULL,
    "value" REAL NOT NULL,
    "sharesOwnedAfter" REAL NOT NULL,
    "tenPercentOwner" INTEGER NOT NULL,
    "tenB51" INTEGER NOT NULL,
    "accessionNo" TEXT NOT NULL,
    "txIndex" INTEGER NOT NULL DEFAULT 0,
    "filedAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "FilingEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "accessionNo" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "filedAt" TEXT NOT NULL
);

-- CreateIndex (a Form 4 accession can hold several purchase lots)
CREATE UNIQUE INDEX "InsiderTx_accessionNo_txIndex_key" ON "InsiderTx"("accessionNo", "txIndex");

-- CreateIndex
CREATE INDEX "InsiderTx_symbol_txDate_idx" ON "InsiderTx"("symbol", "txDate");

-- CreateIndex
CREATE UNIQUE INDEX "FilingEvent_accessionNo_item_key" ON "FilingEvent"("accessionNo", "item");

-- CreateIndex
CREATE INDEX "FilingEvent_symbol_filedAt_idx" ON "FilingEvent"("symbol", "filedAt");
