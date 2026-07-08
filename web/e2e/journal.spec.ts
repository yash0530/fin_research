import { test, expect } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";
import { PRIMARY_SYMBOL } from "./fixture-data";

// /journal — decision log, editor, post-trade outcomes, mistake taxonomy, and
// the governor/calibration console. The seeded JournalEntry + RecCall for
// PRIMARY_SYMBOL means the Quarterly Review Board and the recommendation log
// render real rows. See web/app/journal/CLAUDE.md.

test("/journal renders the log + calibration console with zero console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);

  const response = await page.goto("/journal");
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quarterly Review Board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Calibration / Governor Console" })).toBeVisible();

  // The seeded JournalEntry for PRIMARY_SYMBOL, inside its quarter disclosure.
  await expect(page.getByText(PRIMARY_SYMBOL, { exact: true }).first()).toBeVisible();

  expect(errors, `console errors on /journal:\n${errors.join("\n")}`).toEqual([]);
});
