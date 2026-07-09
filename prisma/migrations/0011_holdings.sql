-- Create InstitutionalHolding table
CREATE TABLE "InstitutionalHolding" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "filerCik" TEXT NOT NULL,
    "filerName" TEXT NOT NULL,
    "periodOfReport" TEXT NOT NULL,
    "cusip" TEXT NOT NULL,
    "nameOfIssuer" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "shares" REAL NOT NULL,
    "filedAt" TEXT NOT NULL,
    CONSTRAINT "uq_InstitutionalHolding_key" UNIQUE ("filerCik", "cusip", "periodOfReport")
);

-- Create index on (filerCik, periodOfReport)
CREATE INDEX "idx_InstitutionalHolding_filer_period" ON "InstitutionalHolding" ("filerCik", "periodOfReport");

-- Create index on (cusip)
CREATE INDEX "idx_InstitutionalHolding_cusip" ON "InstitutionalHolding" ("cusip");
