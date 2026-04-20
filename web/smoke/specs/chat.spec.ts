import { test, expect } from "../fixtures/auth";
import {
  createSmokeAdminClient,
  getMessagesForSession,
} from "../utils/supabase-verify";

test("chat — send, receive, persist", async ({ signedInPage, consoleErrors }) => {
  const page = signedInPage;

  await page.goto("/chat");

  // Start a fresh session — SSR hydrates the most recent web session, so
  // without this the POST appends to whatever the last turn was. Two "New
  // chat" buttons exist (page header + sidebar); either resets client state
  // to a new crypto.randomUUID() sessionId.
  await page.getByRole("button", { name: "New chat" }).first().click();

  // Prose-y prompt rather than "what is 2+2" — a numeric-only reply like
  // "4." round-trips through ReactMarkdown as an empty <ol start="4"><li/></ol>
  // in the DOM (pre-existing renderer edge case), which makes a DOM text
  // assertion brittle. Asking for a specific word gives us a reliable
  // needle for both the DB row and the rendered bubble.
  const prompt = "Reply with exactly the single word hello and nothing else.";
  await page.getByPlaceholder("Ask Mr. Bridge...").fill(prompt);

  // getByRole filters by accessible name, so this locator matches only when
  // aria-label="Send" — i.e. when the composer is idle. Mid-stream the label
  // flips to "Stop generating" and this locator returns zero. Re-asserting
  // visibility later is the signal that the stream settled.
  const sendButton = page.getByRole("button", { name: "Send" });

  const [chatRequest, chatResponse] = await Promise.all([
    page.waitForRequest(
      (req) => req.url().includes("/api/chat") && req.method() === "POST",
    ),
    page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/chat") && resp.request().method() === "POST",
    ),
    sendButton.click(),
  ]);

  expect(chatResponse.status()).toBe(200);
  // `.finished()` resolves when the streaming body closes, not just when
  // headers arrive — that's our "server-side turn done" signal.
  await chatResponse.finished();

  const postData = chatRequest.postData();
  expect(postData, "POST /api/chat had no body").toBeTruthy();
  const body = JSON.parse(postData as string) as { sessionId?: string };
  const sessionId = body.sessionId;
  expect(sessionId, "sessionId missing from /api/chat POST body").toBeTruthy();

  // Wait for the composer to return to idle (aria-label flips back to
  // "Send") — our "client-side turn settled" signal.
  await expect(sendButton).toBeVisible({ timeout: 30_000 });

  // The assistant bubble exists in the DOM (sanity check). Precise text
  // matching happens against the DB row below — the markdown renderer has
  // edge cases where a short answer produces a list-marker-only DOM.
  const assistantBubble = page
    .locator('[data-print-message="assistant"]')
    .last();
  await expect(assistantBubble).toBeVisible();

  // DB is authoritative — bypass RLS with a service-role client and check
  // that user + assistant rows landed with non-empty content matching the
  // semantic needle.
  const admin = createSmokeAdminClient();
  const rows = await getMessagesForSession(admin, sessionId as string);
  expect(rows.length, "expected user + assistant rows").toBeGreaterThanOrEqual(2);
  const [userRow, assistantRow] = rows;
  expect(userRow.role).toBe("user");
  expect(userRow.content).toBe(prompt);
  expect(assistantRow.role).toBe("assistant");
  expect(assistantRow.content.length).toBeGreaterThan(0);
  expect(assistantRow.content).toMatch(/hello/i);

  expect(consoleErrors, `console errors during turn: ${consoleErrors.join("\n")}`)
    .toHaveLength(0);
});
