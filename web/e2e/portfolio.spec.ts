import { test, expect } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";
import { PRIMARY_SYMBOL } from "./fixture-data";

// /portfolio — held positions, watchlist valuation bands, monthly buy ceremony.
// The seeded Position + WatchlistEntry for PRIMARY_SYMBOL means both grids
// render real rows, not just EmptyState. See web/app/portfolio/CLAUDE.md.

test("/portfolio renders positions + watchlist bands with zero console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);

  const response = await page.goto("/portfolio");
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { name: "Portfolio", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Held Positions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Watchlist Valuation Bands" })).toBeVisible();

  // The seeded Position/WatchlistEntry row for PRIMARY_SYMBOL.
  await expect(page.getByRole("link", { name: PRIMARY_SYMBOL }).first()).toBeVisible();

  expect(errors, `console errors on /portfolio:\n${errors.join("\n")}`).toEqual([]);
});
