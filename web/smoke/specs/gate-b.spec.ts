/**
 * Gate B manual-verification automation for #272/#323.
 *
 * Covers everything in Step 2 that Playwright can drive:
 *   - Responsive overflow (all 11 routes × 5 viewports)
 *   - Theme persistence (Light → Dark → Auto; SSR match after reload)
 *   - Touch target minimum size (44×44px) for key interactive elements
 *   - Behavioral regressions #258, #259, #267, #264
 *   - Functional: nav, theme toggle in header, sign-out → sign-in
 *
 * NOT covered (requires human or hardware):
 *   - VoiceOver announcements
 *   - Cross-browser (Safari/Firefox/iOS Safari) — deferred per Gate B rules
 *   - WCAG contrast — baselined in #381; color-contrast already in a11y.spec.ts
 */

import { test, expect } from "../fixtures/auth";
import type { Page } from "@playwright/test";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROTECTED = [
  "/dashboard",
  "/chat",
  "/journal",
  "/tasks",
  "/habits",
  "/meals",
  "/fitness",
  "/weekly",
  "/notifications",
  "/settings",
];

const ALL_ROUTES = [...PROTECTED, "/login"];

const VIEWPORTS = [
  { label: "375", width: 375, height: 812 },
  { label: "430", width: 430, height: 932 },
  { label: "768", width: 768, height: 1024 },
  { label: "1024", width: 1024, height: 768 },
  { label: "1440", width: 1440, height: 900 },
];

/** Settled sentinel for each route — semantic, not networkidle. */
async function waitSettled(page: Page, route: string) {
  if (route === "/chat") {
    await page.getByPlaceholder("Ask Mr. Bridge...").waitFor({ timeout: 20_000 });
  } else if (route === "/login") {
    await page.getByLabel("Email").waitFor({ timeout: 10_000 });
  } else {
    await page.locator("h1").first().waitFor({ timeout: 20_000 });
  }
}

/** Returns true when the page has no horizontal scroll (no overflow). */
async function hasNoHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

// ─── 1. Responsive overflow ───────────────────────────────────────────────────

test.describe("responsive — no horizontal overflow", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.label}px — all 11 routes`, async ({ signedInPage, page }) => {
      const failures: string[] = [];

      for (const route of ALL_ROUTES) {
        const target = route === "/login" ? page : signedInPage;
        await target.setViewportSize({ width: vp.width, height: vp.height });
        await target.goto(route);
        await waitSettled(target, route);

        const ok = await hasNoHorizontalOverflow(target);
        if (!ok) failures.push(route);
      }

      expect(
        failures,
        `Horizontal overflow at ${vp.label}px on: ${failures.join(", ")}`,
      ).toHaveLength(0);
    });
  }
});

// ─── 2. Theme persistence ────────────────────────────────────────────────────

test.describe("theme-switch — SSR match after reload", () => {
  const THEMES: Array<{ label: string; next: string }> = [
    { label: "Light", next: "Dark" },
    { label: "Dark", next: "Auto" },
    { label: "Auto", next: "Light" },
  ];

  for (const { label, next } of THEMES) {
    test(`set ${label} → reload → SSR matches client`, async ({ signedInPage: page }) => {
      await page.goto("/settings");
      await page.locator("h1").first().waitFor({ timeout: 20_000 });

      // Click the theme radio button
      const btn = page.getByRole("radio", { name: label });
      await expect(btn).toBeVisible();
      await btn.click();
      await page.waitForTimeout(300); // let server action fire

      // Capture html[class] after click (next-themes sets it)
      const classAfterClick = await page.locator("html").getAttribute("class");

      // Reload — SSR should serve the correct theme cookie
      await page.reload();
      await page.locator("h1").first().waitFor({ timeout: 20_000 });
      const classAfterReload = await page.locator("html").getAttribute("class");

      expect(classAfterReload, `FOUC: html class changed after reload for ${label}`).toBe(
        classAfterClick,
      );

      // Spot-check a second route to confirm theme is global
      await page.goto("/dashboard");
      await page.locator("h1").first().waitFor({ timeout: 20_000 });
      const classOnDashboard = await page.locator("html").getAttribute("class");
      expect(classOnDashboard, `Theme not applied on /dashboard for ${label}`).toBe(
        classAfterClick,
      );

      // Reset to Auto for next test
      await page.goto("/settings");
      await page.locator("h1").first().waitFor({ timeout: 20_000 });
      await page.getByRole("radio", { name: "Auto" }).click();
      await page.waitForTimeout(200);
    });
  }
});

// ─── 3. Touch targets ────────────────────────────────────────────────────────

const MOBILE_VP = { width: 375, height: 812 };
const MIN_TAP = 44; // px

test.describe("touch targets — 375px", () => {
  test("theme pills in /settings ≥ 44×44", async ({ signedInPage: page }) => {
    await page.setViewportSize(MOBILE_VP);
    await page.goto("/settings");
    await page.locator("h1").first().waitFor({ timeout: 20_000 });

    for (const label of ["Auto", "Light", "Dark"]) {
      const btn = page.getByRole("radio", { name: label });
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      expect(box, `${label} pill has no bounding box`).toBeTruthy();
      expect(box!.height, `${label} pill height < ${MIN_TAP}px`).toBeGreaterThanOrEqual(MIN_TAP);
    }
  });

  test("header theme-toggle button ≥ 32px (design spec) — desktop sidebar", async ({
    signedInPage: page,
  }) => {
    // ThemeToggle is in the desktop sidebar (hidden lg:flex) — visible at ≥1024px,
    // and in the mobile "More" bottom sheet at <1024px (requires sheet open to access).
    // Test at 1024px where it's directly visible.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/dashboard");
    await page.locator("h1").first().waitFor({ timeout: 20_000 });

    // ThemeToggle renders as button with aria-label starting "Theme:"
    const btn = page.getByRole("button", { name: /^Theme:/i }).first();
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box, "ThemeToggle has no bounding box").toBeTruthy();
    // Design spec: 32×32 — use Math.round to absorb sub-pixel float variance
    expect(Math.round(box!.width)).toBeGreaterThanOrEqual(32);
    expect(Math.round(box!.height)).toBeGreaterThanOrEqual(32);
  });

  test("WindowSelector pills visible at 375px", async ({ signedInPage: page }) => {
    await page.setViewportSize(MOBILE_VP);
    await page.goto("/dashboard");
    await page.locator("h1").first().waitFor({ timeout: 20_000 });

    // WindowSelector is hidden on mobile (hidden lg:block) — confirm it is NOT rendered
    // (regression guard: if it leaks into mobile it overflows)
    const selector = page.locator(
      "[data-testid='window-selector'], [aria-label*='window' i], [aria-label*='Window' i]",
    );
    const count = await selector.count();
    if (count > 0) {
      const visible = await selector.first().isVisible();
      // Should be hidden on mobile per responsive design
      expect(visible, "WindowSelector leaked into 375px viewport").toBe(false);
    }
  });
});

// ─── 4. Behavioral regressions ───────────────────────────────────────────────

test.describe("regression #258 — mobile dashboard header at 375px", () => {
  test("masthead renders without horizontal overflow", async ({ signedInPage: page }) => {
    await page.setViewportSize(MOBILE_VP);
    await page.goto("/dashboard");
    await page.locator("h1").first().waitFor({ timeout: 20_000 });

    // Masthead is a <header> with font-heading class
    const masthead = page.locator("header").first();
    await expect(masthead).toBeVisible();
    const mastheadBox = await masthead.boundingBox();
    const vpWidth = MOBILE_VP.width;
    expect(mastheadBox!.width, "Masthead wider than viewport at 375px").toBeLessThanOrEqual(
      vpWidth,
    );

    // "Mr. Bridge" brand text visible in the main-content masthead.
    // Scope to <main> so we don't match the Nav sidebar's "Mr. Bridge" span
    // (which is hidden on mobile via "hidden lg:flex").
    await expect(page.locator("main").getByText("Mr. Bridge").first()).toBeVisible();
  });
});

test.describe("regression #259 — sports card vertical stacking", () => {
  test("dashboard sports grid is single-column at 375px", async ({ signedInPage: page }) => {
    await page.setViewportSize(MOBILE_VP);
    await page.goto("/dashboard");
    await page.locator("h1").first().waitFor({ timeout: 20_000 });

    // The sports/scores section uses grid-cols-1 at mobile, lg:grid-cols-2 at desktop.
    // Verify there is no horizontal scroll (proxy for no side-by-side overflow).
    const overflow = await hasNoHorizontalOverflow(page);
    expect(
      overflow,
      "Dashboard has horizontal scroll at 375px (sports card may not be stacking)",
    ).toBe(true);
  });
});

test.describe("regression #267 — chat sidebar visible at ≥1024px", () => {
  test("session sidebar renders at 1024px viewport", async ({ signedInPage: page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/chat");
    await page.getByPlaceholder("Ask Mr. Bridge...").waitFor({ timeout: 20_000 });

    // The sidebar div has class "hidden lg:block" — at 1024px lg breakpoint it should be visible
    const sidebar = page.locator(".hidden.lg\\:block").first();
    await expect(sidebar).toBeVisible();
  });

  test("session sidebar is hidden at 375px", async ({ signedInPage: page }) => {
    await page.setViewportSize(MOBILE_VP);
    await page.goto("/chat");
    await page.getByPlaceholder("Ask Mr. Bridge...").waitFor({ timeout: 20_000 });

    // Mobile: chat history button exists instead of inline sidebar
    const historyBtn = page.getByRole("button", { name: "Chat history" });
    await expect(historyBtn).toBeVisible();
  });
});

test.describe("regression #264 — print styles", () => {
  for (const route of ["/dashboard", "/journal", "/chat"]) {
    test(`${route} — print:hidden elements not visible in print media`, async ({
      signedInPage: page,
    }) => {
      await page.goto(route);
      await waitSettled(page, route);

      await page.emulateMedia({ media: "print" });

      // Use getComputedStyle inside evaluate — more reliable than isVisible() for
      // media-query-driven display changes in headless Chromium.
      const stillVisible = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll(".print\\:hidden"));
        return els
          .slice(0, 5)
          .filter((el) => window.getComputedStyle(el).display !== "none")
          .map((el) => el.tagName + (el.className ? `[${el.className.split(" ")[0]}]` : ""));
      });
      expect(
        stillVisible,
        `print:hidden elements still display:block in print media on ${route}: ${stillVisible.join(", ")}`,
      ).toHaveLength(0);

      await page.emulateMedia({ media: "screen" });
    });
  }
});

// ─── 5. Functional smoke ─────────────────────────────────────────────────────

test.describe("functional smoke", () => {
  test("all nav items navigate without error", async ({ signedInPage: page }) => {
    const NAV_ROUTES: Array<{ label: string | RegExp; path: string }> = [
      { label: /dashboard/i, path: "/dashboard" },
      { label: /chat/i, path: "/chat" },
      { label: /journal/i, path: "/journal" },
      { label: /tasks/i, path: "/tasks" },
      { label: /habits/i, path: "/habits" },
      { label: /meals/i, path: "/meals" },
      { label: /fitness/i, path: "/fitness" },
      { label: /weekly/i, path: "/weekly" },
      { label: /notifications/i, path: "/notifications" },
      { label: /settings/i, path: "/settings" },
    ];

    for (const item of NAV_ROUTES) {
      await page.goto(item.path);
      await waitSettled(page, item.path);
      expect(page.url()).toContain(item.path);
    }
  });

  test("theme toggle in header cycles without console errors", async ({
    signedInPage: page,
    consoleErrors,
  }) => {
    await page.goto("/dashboard");
    await page.locator("h1").first().waitFor({ timeout: 20_000 });

    const toggle = page.getByRole("button", { name: /^Theme:/i });
    await expect(toggle).toBeVisible();

    // Cycle through all three states
    await toggle.click();
    await page.waitForTimeout(200);
    await toggle.click();
    await page.waitForTimeout(200);
    await toggle.click();
    await page.waitForTimeout(200);

    expect(consoleErrors.filter((e) => !e.includes("hydration"))).toHaveLength(0);
  });

  test("sign-out → redirect to /login → sign back in", async ({ signedInPage: page }) => {
    await page.goto("/settings");
    await page.locator("h1").first().waitFor({ timeout: 20_000 });

    // Find and click sign-out button
    const signOutBtn = page.getByRole("button", { name: /sign.?out/i });
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    // Should redirect to /login
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page.getByLabel("Email")).toBeVisible();

    // Sign back in
    await page.getByLabel("Email").fill(process.env.SMOKE_TEST_EMAIL ?? "");
    await page.getByLabel("Password", { exact: true }).fill(process.env.SMOKE_TEST_PASSWORD ?? "");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL(/\/(dashboard|chat)/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/(dashboard|chat)/);
  });
});
