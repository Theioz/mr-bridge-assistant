/**
 * Smoke test for issue #516 — continuous progress feedback during tool-calling turns.
 *
 * Verifies that a ToolStatusBar chip (either the "Working…" fallback or a named chip)
 * is visible at some point between the user sending a message and the turn completing.
 * Before the fix, a dead zone between typing-dots hiding and the first named chip
 * produced a silent freeze; "Working…" now covers that gap.
 */
import { test, expect } from "../fixtures/auth";

test("chat tool-call turn — status chip visible during turn (no dead zone)", async ({
  signedInPage,
  consoleErrors,
}) => {
  const page = signedInPage;

  await page.goto("/chat");
  consoleErrors.length = 0;

  await page.getByRole("button", { name: "New chat" }).first().click();

  const sendButton = page.getByRole("button", { name: "Send" });
  const stopButton = page.getByRole("button", { name: "Stop generating" });

  // "what are my tasks?" reliably triggers get_tasks — one tool call, fast.
  await page.getByPlaceholder("Ask Mr. Bridge...").fill("what are my tasks?");

  const [, chatResponse] = await Promise.all([
    page.waitForRequest((req) => req.url().includes("/api/chat") && req.method() === "POST"),
    page.waitForResponse(
      (resp) => resp.url().includes("/api/chat") && resp.request().method() === "POST",
    ),
    sendButton.click(),
  ]);

  expect(chatResponse.status()).toBe(200);

  // Wait for the turn to enter in-flight state (stop button appears).
  await expect(stopButton).toBeVisible({ timeout: 10_000 });

  // A status chip ([data-testid="tool-status-chip"]) should be visible during
  // the turn — either the "Working…" fallback or a named tool chip. This
  // assertion is the key regression guard for issue #516.
  const chip = page.locator('[data-testid="tool-status-chip"]').first();
  await expect(chip).toBeVisible({ timeout: 15_000 });

  // Wait for the full turn to settle.
  await chatResponse.finished();
  await expect(sendButton).toBeVisible({ timeout: 30_000 });

  expect(consoleErrors, `console errors during turn: ${consoleErrors.join("\n")}`).toHaveLength(0);
});
