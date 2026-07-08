import { test, expect } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

// / — Action Center: welcome-back banner, header micro-strip, Sourcing Inbox,
// Action Queue, Tripwire & Decay Alerts, Digest Insights, Calibration,
// Portfolio Snapshot. See web/app/CLAUDE.md.

test("Action Center (/) renders with zero console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  // Sidebar brand — present on every route (persistent shell).
  await expect(page.locator(".brand-name")).toHaveText("ENGINE");

  // Header + at least one dashboard panel.
  await expect(page.getByRole("heading", { name: "Action Center" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sourcing Inbox" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Portfolio Snapshot" })).toBeVisible();

  expect(errors, `console errors on /:\n${errors.join("\n")}`).toEqual([]);
});
