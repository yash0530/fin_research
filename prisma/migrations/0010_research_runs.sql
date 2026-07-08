-- Create ResearchRun table
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runType" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "budgetSeconds" INTEGER NOT NULL,
    "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL CHECK ("status" IN ('PENDING', 'RUNNING', 'PAUSING', 'PAUSED', 'COMPLETED', 'TIMEOUT_GRACEFUL', 'CANCELLED', 'FAILED')),
    "profile" TEXT NOT NULL,
    "pid" INTEGER,
    "createdAt" TEXT NOT NULL,
    "startedAt" TEXT,
    "updatedAt" TEXT,
    "completedAt" TEXT,
    "artifactPath" TEXT,
    "errorMessage" TEXT
);

-- Create ResearchRunStep table
CREATE TABLE "ResearchRunStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "status" TEXT NOT NULL CHECK ("status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED')),
    "payload" TEXT,
    "resultCheckpoint" TEXT,
    "startedAt" TEXT,
    "completedAt" TEXT,
    FOREIGN KEY ("runId") REFERENCES "ResearchRun" ("id") ON DELETE CASCADE
);

-- Create index on runId
CREATE INDEX "idx_ResearchRunStep_runId" ON "ResearchRunStep" ("runId");
