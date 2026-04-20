import { test as base, expect, type Page } from "@playwright/test";

type SmokeFixtures = {
  signedInPage: Page;
  consoleErrors: string[];
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is required for smoke tests. See docs/smoke-testing.md.`,
    );
  }
  return v;
}

export const test = base.extend<SmokeFixtures>({
  consoleErrors: async ({}, use) => {
    const errors: string[] = [];
    await use(errors);
  },

  signedInPage: async ({ page, consoleErrors }, use) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });

    const email = requireEnv("SMOKE_TEST_EMAIL");
    const password = requireEnv("SMOKE_TEST_PASSWORD");

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Default redirect is /dashboard; protected layout enforces auth.
    await page.waitForURL(/\/(dashboard|chat)/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/(dashboard|chat)/);

    await use(page);
  },
});

export { expect };
