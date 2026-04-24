import { test, expect } from "../fixtures/auth";

// Regression for the ThemeToggle SSR/client mismatch: next-themes reads from
// localStorage on the client, which may disagree with the cookie-backed
// defaultTheme the server rendered with. Before the fix, /dashboard threw
// React #418 ("server rendered HTML didn't match the client") on every load.
test("dashboard hydrates without React hydration errors", async ({
  signedInPage,
  consoleErrors,
}) => {
  const page = signedInPage;
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  // Give React a beat to surface any hydration warnings after the initial paint.
  await page.waitForLoadState("networkidle").catch(() => {});

  const hydrationErrors = consoleErrors.filter(
    (msg) => /hydrat|#418|Minified React error/i.test(msg) && !/favicon/i.test(msg),
  );
  expect(
    hydrationErrors,
    `dashboard threw hydration errors:\n${hydrationErrors.join("\n")}`,
  ).toEqual([]);

  // Preserve the existing pre-existing-errors convention from chat.spec.ts.
  consoleErrors.length = 0;
});
