import { test, expect } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";
import { THEME_CODE } from "./fixture-data";

// /themes redirects to /themes/ai (single theme in v1). The ranked table OR the
// "No ranked names" EmptyState is an acceptable render — both are a real panel,
// not a crash (see web/app/themes/[code]/page.tsx RankedTable).

test("/themes redirects to /themes/ai and renders with zero console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);

  const response = await page.goto("/themes");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/themes/${THEME_CODE}$`));

  await expect(page.getByRole("heading", { name: "AI Infrastructure", level: 1 })).toBeVisible();
  await expect(page.getByText("Subthemes")).toBeVisible();

  // Ranked table or its EmptyState — either is a real render.
  const rankedOrEmpty = page.locator("table").or(page.getByText("No ranked names"));
  await expect(rankedOrEmpty.first()).toBeVisible();

  expect(errors, `console errors on /themes:\n${errors.join("\n")}`).toEqual([]);
});
