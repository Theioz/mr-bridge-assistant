import { test, expect } from "../fixtures/auth";
import {
  createSmokeAdminClient,
  getMessagesForSession,
} from "../utils/supabase-verify";

test("chat multi-turn — conversation history is threaded", async ({
  signedInPage,
  consoleErrors,
}) => {
  const page = signedInPage;

  await page.goto("/chat");

  // Fresh session — SSR hydrates the most recent session without this.
  await page.getByRole("button", { name: "New chat" }).first().click();

  const sendButton = page.getByRole("button", { name: "Send" });

  // — Turn 1: "What's 2+2?" —
  await page.getByPlaceholder("Ask Mr. Bridge...").fill("What's 2+2?");

  const [turn1Request, turn1Response] = await Promise.all([
    page.waitForRequest(
      (req) => req.url().includes("/api/chat") && req.method() === "POST",
    ),
    page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/chat") && resp.request().method() === "POST",
    ),
    sendButton.click(),
  ]);

  expect(turn1Response.status()).toBe(200);
  await turn1Response.finished();

  // Capture sessionId from the first POST body — the second POST will reuse it,
  // proving both turns share the same conversation thread.
  const postData = turn1Request.postData();
  expect(postData, "POST /api/chat had no body").toBeTruthy();
  const { sessionId } = JSON.parse(postData as string) as {
    sessionId?: string;
  };
  expect(sessionId, "sessionId missing from POST body").toBeTruthy();

  await expect(sendButton).toBeVisible({ timeout: 30_000 });

  // — Turn 2: "Double that answer" — must resolve to 8 via conversation history —
  await page
    .getByPlaceholder("Ask Mr. Bridge...")
    .fill("Double that answer");

  const [, turn2Response] = await Promise.all([
    page.waitForRequest(
      (req) => req.url().includes("/api/chat") && req.method() === "POST",
    ),
    page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/chat") && resp.request().method() === "POST",
    ),
    sendButton.click(),
  ]);

  expect(turn2Response.status()).toBe(200);
  await turn2Response.finished();
  await expect(sendButton).toBeVisible({ timeout: 30_000 });

  // DB is authoritative for short/numeric replies — the markdown renderer can
  // turn a bare "8" into an empty list marker in the DOM (pre-existing edge case).
  const admin = createSmokeAdminClient();
  const rows = await getMessagesForSession(admin, sessionId as string);

  // Two turns = user1, assistant1, user2, assistant2
  expect(rows.length, "expected at least 4 rows (2 full turns)").toBeGreaterThanOrEqual(4);

  const assistant2 = rows[rows.length - 1];
  expect(assistant2.role).toBe("assistant");
  expect(assistant2.content).toMatch(/8/);

  expect(
    consoleErrors,
    `console errors during test: ${consoleErrors.join("\n")}`,
  ).toHaveLength(0);
});
