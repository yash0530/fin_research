import { test, expect } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";
import { PRIMARY_SYMBOL } from "./fixture-data";

// /tickers/[symbol] — the ticker cockpit. Hits the seeded PRIMARY_SYMBOL (dual
// ai_*/g_* sector links, ~300 sessions of prices, ~12 fundamentals quarters,
// watchlisted, held, journal-logged) so the four cockpit quadrants render real
// data, not the "ticker not found" empty page. See web/app/tickers/[symbol]/CLAUDE.md.

test(`/tickers/${PRIMARY_SYMBOL} renders the cockpit with zero console errors`, async ({ page }) => {
  const errors = collectConsoleErrors(page);

  const response = await page.goto(`/tickers/${PRIMARY_SYMBOL}`);
  expect(response?.status()).toBe(200);

  await expect(page.locator(".brand-name")).toHaveText("ENGINE");
  await expect(page.getByText(PRIMARY_SYMBOL, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workstation Cockpit" })).toBeVisible();

  // The four cockpit quadrants.
  await expect(page.getByText("BUY-ZONE?")).toBeVisible();
  await expect(page.getByText("QUALITY?")).toBeVisible();
  await expect(page.getByText("WHY NOW?")).toBeVisible();
  await expect(page.getByText("WHAT KILLS IT?")).toBeVisible();

  expect(errors, `console errors on /tickers/${PRIMARY_SYMBOL}:\n${errors.join("\n")}`).toEqual([]);
});
