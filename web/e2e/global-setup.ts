// Playwright globalSetup: builds the temp fixture DB BEFORE `webServer` boots
// `next start` against it. See `env.ts` for the shared DB_PATH/PORT constants
// and `fixture-db.ts` for what gets seeded.
import { buildFixtureDb } from "./fixture-db";
import { DB_PATH } from "./env";

export default function globalSetup(): void {
  buildFixtureDb(DB_PATH);
  console.log(`[e2e] fixture DB ready at ${DB_PATH}`);
}
