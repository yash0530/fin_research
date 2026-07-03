-- Tag every verdict with the prompt version that produced it, so calibration
-- slices never mix a v1 judge with a v2 judge. Matches the runtime guard in
-- src/db/queries.saveRecCall. Additive; existing rows get the pre-tagging label.
ALTER TABLE "RecCall" ADD COLUMN "promptVersion" TEXT NOT NULL DEFAULT 'v1';
