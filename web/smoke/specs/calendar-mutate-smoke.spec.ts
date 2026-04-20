import { test, expect } from "../fixtures/auth";

test("calendar mutate — create then delete Smoke Test event", async ({
  signedInPage: page,
  consoleErrors,
}) => {
  await page.goto("/chat");

  // Start fresh to avoid appending to a prior turn's session.
  await page.getByRole("button", { name: "New chat" }).first().click();
  await expect(page.getByPlaceholder("Ask Mr. Bridge...")).toBeVisible();

  const sendButton = page.getByRole("button", { name: "Send" });

  // — Turn 1: create —
  await page
    .getByPlaceholder("Ask Mr. Bridge...")
    .fill("Create a calendar event called Smoke Test tomorrow at 10am");

  const [, createResponse] = await Promise.all([
    page.waitForRequest(
      (req) => req.url().includes("/api/chat") && req.method() === "POST",
    ),
    page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/chat") && resp.request().method() === "POST",
    ),
    sendButton.click(),
  ]);

  expect(createResponse.status()).toBe(200);
  await createResponse.finished();
  await expect(sendButton).toBeVisible({ timeout: 30_000 });

  const createBubble = page.locator('[data-print-message="assistant"]').last();
  await expect(createBubble).toBeVisible();
  const createText = await createBubble.textContent();
  console.log("Create reply:", createText?.slice(0, 300));
  expect(createText?.toLowerCase()).toMatch(/creat|schedul|add/);

  // — Turn 2: delete —
  await page
    .getByPlaceholder("Ask Mr. Bridge...")
    .fill("Delete the Smoke Test event tomorrow");

  const [, deleteResponse] = await Promise.all([
    page.waitForRequest(
      (req) => req.url().includes("/api/chat") && req.method() === "POST",
    ),
    page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/chat") && resp.request().method() === "POST",
    ),
    sendButton.click(),
  ]);

  expect(deleteResponse.status()).toBe(200);
  await deleteResponse.finished();
  await expect(sendButton).toBeVisible({ timeout: 30_000 });

  const deleteBubble = page.locator('[data-print-message="assistant"]').last();
  await expect(deleteBubble).toBeVisible();
  const deleteText = await deleteBubble.textContent();
  console.log("Delete reply:", deleteText?.slice(0, 300));
  expect(deleteText?.toLowerCase()).toMatch(/delet|remov|cancel/);

  expect(
    consoleErrors,
    `console errors during test: ${consoleErrors.join("\n")}`,
  ).toHaveLength(0);
});
