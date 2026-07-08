// Chromium-only smoke suite over the 5 live routes, against a temp fixture
// SQLite DB (never `data/engine.db`) — see `e2e/CLAUDE.md`. Wired as the
// `verify:ui` script at the repo root (kept OUT of the engine-only `npm run
// verify` so that gate never grows a browser dependency).
import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE_URL, DB_PATH, PORT } from "./e2e/env";

// Report/artifact dirs live under the OS tmpdir, never inside the repo — so a
// leftover `test-results/`/`playwright-report/` directory can never trip
// `npm run check:claude` (which requires a CLAUDE.md in every repo directory).
const ARTIFACT_ROOT = join(tmpdir(), "engine-e2e-artifacts");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: join(ARTIFACT_ROOT, "report"), open: "never" }],
  ],
  outputDir: join(ARTIFACT_ROOT, "test-results"),
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    cwd: __dirname,
    env: { DATABASE_URL: `file:${DB_PATH}` },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
