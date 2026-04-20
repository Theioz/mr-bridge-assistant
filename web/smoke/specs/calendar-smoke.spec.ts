import { test, expect } from "../fixtures/auth";

test("calendar tool — list events fires without config error", async ({ signedInPage: page, consoleErrors }) => {
  await page.goto("/chat");
  await expect(page.getByPlaceholder("Ask Mr. Bridge...")).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder("Ask Mr. Bridge...").fill("list my calendar events for today");
  await page.getByPlaceholder("Ask Mr. Bridge...").press("Enter");

  await expect(page.locator('[data-print-message="assistant"]')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(3000);

  const text = await page.locator('[data-print-message="assistant"]').last().textContent();
  console.log("Calendar reply:", text?.slice(0, 300));

  expect(text).not.toContain("ENCRYPTION_KEY env var is required");
  expect(text).not.toContain("Missing Google OAuth env vars");
  expect(consoleErrors).toHaveLength(0);
});
