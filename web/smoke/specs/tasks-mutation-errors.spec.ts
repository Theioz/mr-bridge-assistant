import type { Page, Route } from "@playwright/test";
import { test, expect } from "../fixtures/auth";

/**
 * Regression guard for #687 — task mutations used to fail silently.
 *
 * Every mutation in task-item.tsx was `await someAction(...)` with the return value dropped. The
 * server actions signal failure by RETURNING `{ error }` rather than throwing, so nothing
 * rejected, `useTransition` resolved, `isPending` flipped back, and the row un-greyed looking
 * exactly as before. Success was reported by omission.
 *
 * The user-visible contract this pins:
 *   1. a failed mutation shows a message and leaves the previous value intact
 *   2. a later successful mutation clears that message
 *
 * Asserting on the ERROR TEXT rather than on internals is deliberate: the failure mode was that
 * nothing appeared, so "something appeared" is the thing worth testing.
 */

const TITLE = `smoke-687-${Date.now()}`;
const RENAMED = `${TITLE}-renamed`;

/** Next server actions POST to the current URL carrying a `next-action` header. */
async function failServerActions(page: Page) {
  await page.route("**/tasks**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "smoke-induced failure",
      });
      return;
    }
    await route.continue();
  });
}

test("task mutation failures surface on the row and preserve the old value", async ({
  signedInPage,
}) => {
  const page = signedInPage;
  await page.goto("/tasks");

  // ── Arrange: a task of our own to mutate, created through the real (unstubbed) path.
  await page.getByPlaceholder("Add a task…").fill(TITLE);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const row = page.getByText(TITLE, { exact: true });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // ── Act: make every server action fail, then rename.
  await failServerActions(page);
  await row.click(); // the title becomes an input
  const editor = page.locator('input[value="' + TITLE + '"]');
  await editor.fill(RENAMED);
  await editor.press("Enter");

  // ── Assert 1: the failure is visible. Before #687 nothing rendered at all.
  await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 15_000 });

  // ── Assert 2: the row still holds the value the database actually has. A rename that only
  // succeeded in the browser is the same lie as a silent failure.
  await expect(page.getByText(TITLE, { exact: true })).toBeVisible();
  await expect(page.getByText(RENAMED, { exact: true })).toHaveCount(0);

  // ── Act: stop failing, rename again for real.
  await page.unroute("**/tasks**");
  await page.getByText(TITLE, { exact: true }).click();
  const editor2 = page.locator('input[value="' + TITLE + '"]');
  await editor2.fill(RENAMED);
  await editor2.press("Enter");

  // ── Assert 3: success clears the error and the new value sticks.
  await expect(page.getByText(RENAMED, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);

  // ── Cleanup: archive the task so repeated runs don't accumulate rows.
  await page.getByText(RENAMED, { exact: true }).hover();
  const archive = page.getByTitle("Archive").first();
  if (await archive.isVisible().catch(() => false)) await archive.click();
});
