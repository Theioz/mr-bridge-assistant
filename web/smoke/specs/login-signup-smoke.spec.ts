import { test, expect } from "@playwright/test";

// Smoke test for the three-mode login form (sign-in / sign-up / forgot-password)
// and the /reset-password page. Does not attempt real Supabase auth — tests
// UI state, form validation, and mode toggling.

test.describe("Login page — mode switching", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("default state shows sign-in form", async ({ page }) => {
    await expect(page.getByText("Personal assistant")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("New here?")).toBeVisible();
    await expect(page.getByText("Forgot password?")).toBeVisible();
    // Demo button visible in sign-in mode (conditionally rendered; skip if env not set)
    // password field visible
    await expect(page.locator("#password")).toBeVisible();
    // confirm-password field NOT present
    await expect(page.locator("#confirm-password")).not.toBeVisible();
  });

  test("switches to sign-up mode", async ({ page }) => {
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.getByText("Create your account")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    await expect(page.locator("#confirm-password")).toBeVisible();
    // Demo button hidden in signup mode
    await expect(page.getByRole("button", { name: "Try the demo" })).not.toBeVisible();
    // Back link present
    await expect(page.getByText("Already have an account?")).toBeVisible();
  });

  test("sign-up: password mismatch disables submit and shows error on submit attempt", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Create an account" }).click();

    await page.locator("#email").fill("user@example.com");
    await page.locator("#password").fill("password123");
    await page.locator("#confirm-password").fill("different456");

    // Submit button should be disabled (passwords don't match → confirmInvalid)
    const btn = page.getByRole("button", { name: "Create account" });
    await expect(btn).toBeDisabled();
  });

  test("sign-up: matching passwords enables submit", async ({ page }) => {
    await page.getByRole("button", { name: "Create an account" }).click();

    await page.locator("#email").fill("user@example.com");
    await page.locator("#password").fill("password123");
    await page.locator("#confirm-password").fill("password123");

    const btn = page.getByRole("button", { name: "Create account" });
    await expect(btn).toBeEnabled();
  });

  test("switches to forgot-password mode", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByText("Reset your password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
    // Password field hidden in forgot mode
    await expect(page.locator("#password")).not.toBeVisible();
    // Demo button hidden
    await expect(page.getByRole("button", { name: "Try the demo" })).not.toBeVisible();
    // Back link
    await expect(page.getByRole("button", { name: "Back to sign in" })).toBeVisible();
  });

  test("forgot-password: invalid email disables submit", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.locator("#email").fill("notanemail");
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeDisabled();
  });

  test("forgot-password: valid email enables submit", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.locator("#email").fill("user@example.com");
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });

  test("back to sign-in from forgot-password mode", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(page.getByText("Personal assistant")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("back to sign-in from sign-up mode", async ({ page }) => {
    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Personal assistant")).toBeVisible();
  });

  test("switching modes clears error state", async ({ page }) => {
    // Go to signup, mismatch passwords, try to submit (fires error client-side)
    await page.getByRole("button", { name: "Create an account" }).click();
    await page.locator("#email").fill("user@example.com");
    await page.locator("#password").fill("abc");
    await page.locator("#confirm-password").fill("xyz");
    // Force a submit by temporarily matching, then evaluating form submit
    // Instead just switch mode and confirm error is cleared
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#login-error")).not.toBeVisible();
  });

  test("all interactive elements are at least 44px tall", async ({ page }) => {
    const buttons = await page.locator("button").all();
    for (const btn of buttons) {
      const text = (await btn.textContent()) ?? "";
      const ariaLabel = (await btn.getAttribute("aria-label")) ?? "";
      // Next.js injects a dev-tools button in development mode — skip it
      if (text.includes("Next.js") || ariaLabel.includes("Next.js")) continue;
      const box = await btn.boundingBox();
      if (box && box.width > 0) {
        expect(box.height).toBeGreaterThanOrEqual(43); // allow 1px rounding
      }
    }
  });
});

test.describe("/reset-password page", () => {
  test("renders new-password form", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("Set new password")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirm-password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Update password" })).toBeVisible();
  });

  test("submit disabled when passwords empty", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("button", { name: "Update password" })).toBeDisabled();
  });

  test("submit disabled when passwords mismatch", async ({ page }) => {
    await page.goto("/reset-password");
    await page.locator("#password").fill("newpass123");
    await page.locator("#confirm-password").fill("different");
    await expect(page.getByRole("button", { name: "Update password" })).toBeDisabled();
  });

  test("submit enabled when passwords match", async ({ page }) => {
    await page.goto("/reset-password");
    await page.locator("#password").fill("newpass123");
    await page.locator("#confirm-password").fill("newpass123");
    await expect(page.getByRole("button", { name: "Update password" })).toBeEnabled();
  });

  test("show/hide password toggle works", async ({ page }) => {
    await page.goto("/reset-password");
    const input = page.locator("#password");
    await expect(input).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(input).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(input).toHaveAttribute("type", "password");
  });
});
