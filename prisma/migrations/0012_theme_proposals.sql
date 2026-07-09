-- Create ThemeProposal table
CREATE TABLE "ThemeProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    "proposedName" TEXT NOT NULL,
    "proposedCode" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "subthemesJson" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "decidedAt" TEXT
);

-- Create UserTheme table
CREATE TABLE "UserTheme" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subthemesJson" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL
);
