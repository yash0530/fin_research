#!/usr/bin/env tsx
// Enforces the invariant: every source directory carries a CLAUDE.md.
// Run via `npm run check:claude` (part of `npm run verify`). Exits non-zero
// with a list of offenders so it can gate commits.

import { readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".vitest",
  "__fixtures__",
]);

function walk(dir: string, out: string[]): void {
  out.push(dir);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (IGNORE.has(entry.name)) continue;
    walk(join(dir, entry.name), out);
  }
}

const dirs: string[] = [];
walk(ROOT, dirs);

const missing = dirs.filter((d) => !existsSync(join(d, "CLAUDE.md")));

if (missing.length > 0) {
  console.error(`\u2717 ${missing.length} director(ies) missing CLAUDE.md:`);
  for (const d of missing) console.error("    " + (relative(ROOT, d) || "."));
  process.exit(1);
}

console.log(`\u2713 CLAUDE.md present in all ${dirs.length} directories.`);
