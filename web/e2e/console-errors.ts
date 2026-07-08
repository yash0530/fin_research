// Shared "zero console errors" guard for every route spec. Attach BEFORE
// navigating so nothing is missed, then assert at the end of the test.
//
// Allowlist: currently EMPTY. If a specific route spec needs to ignore a known,
// benign message (e.g. Next.js hydration noise that actually reproduces here),
// add it to that spec's own allowlist array and document the exact string +
// justification in this directory's CLAUDE.md — do not widen this shared file
// silently.
import type { Page } from "@playwright/test";

export function collectConsoleErrors(page: Page, allowlist: (string | RegExp)[] = []): string[] {
  const errors: string[] = [];

  const isAllowed = (text: string): boolean =>
    allowlist.some((entry) => (typeof entry === "string" ? text.includes(entry) : entry.test(text)));

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isAllowed(text)) return;
    errors.push(text);
  });

  // Uncaught exceptions in page JS don't come through page.on("console") — track
  // them too so a real crash can't slip past an empty console-errors array.
  page.on("pageerror", (err) => {
    const text = `pageerror: ${err.message}`;
    if (isAllowed(text)) return;
    errors.push(text);
  });

  return errors;
}
