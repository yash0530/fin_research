// Shared constants for the Playwright smoke suite: the temp fixture DB path and
// the spare port `next start` boots on. Both `playwright.config.ts` (webServer)
// and `global-setup.ts` (fixture build) import this SAME module instance within
// one Playwright process, so the path/port stay consistent without a temp file
// hand-off.
//
// Port choice: a fixed, uncommon high port (not 3000/3001 dev defaults, not the
// 4173 Vite-preview default) rather than a dynamically-probed free port — kept
// simple for a smoke suite. Override with E2E_PORT if it ever collides on a dev
// box (documented in this directory's CLAUDE.md).
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PORT = Number(process.env.E2E_PORT ?? 4319);

// One temp DB file per Playwright process invocation (never data/engine.db).
export const DB_PATH = join(tmpdir(), `engine-e2e-${randomUUID().slice(0, 8)}.db`);

export const BASE_URL = `http://127.0.0.1:${PORT}`;
