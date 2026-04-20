import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/auth";

type Route = {
  path: string;
  auth: "signed-in" | "public";
  settled: (page: Page) => Locator;
};

// Sentinels are semantic, not networkidle — /chat and /dashboard hold
// streaming / long-poll connections that never quiet the network tab.
const ROUTES: Route[] = [
  { path: "/dashboard",     auth: "signed-in", settled: (p) => p.locator("h1").first() },
  { path: "/chat",          auth: "signed-in", settled: (p) => p.getByPlaceholder("Ask Mr. Bridge...") },
  { path: "/fitness",       auth: "signed-in", settled: (p) => p.locator("h1").first() },
  { path: "/habits",        auth: "signed-in", settled: (p) => p.locator("h1").first() },
  { path: "/tasks",         auth: "signed-in", settled: (p) => p.locator("h1").first() },
  { path: "/weekly",        auth: "signed-in", settled: (p) => p.locator("h1").first() },
  { path: "/journal",       auth: "signed-in", settled: (p) => p.locator("h1").first() },
  { path: "/meals",         auth: "signed-in", settled: (p) => p.locator("h1").first() },
  { path: "/notifications", auth: "signed-in", settled: (p) => p.locator("h1").first() },
  { path: "/settings",      auth: "signed-in", settled: (p) => p.locator("h1").first() },
  { path: "/login",         auth: "public",    settled: (p) => p.getByLabel("Email") },
];

test.describe("a11y — axe sweep (critical + serious)", () => {
  for (const route of ROUTES) {
    test(`${route.path}`, async ({ signedInPage, page }, testInfo) => {
      const target = route.auth === "signed-in" ? signedInPage : page;
      await target.goto(route.path);
      await expect(route.settled(target)).toBeVisible({ timeout: 20_000 });

      // color-contrast baselined in #381 — affects active nav links, tab /
      // radio segmented controls, and a few secondary-text spans across all
      // 10 protected routes. Re-enable once #381 lands.
      const results = await new AxeBuilder({ page: target })
        .disableRules(["color-contrast"])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      const advisory = results.violations.filter(
        (v) => v.impact === "moderate" || v.impact === "minor",
      );

      // Advisory findings surface in the HTML report without failing the
      // gate — stays visible so we don't silently accumulate them.
      for (const v of advisory) {
        testInfo.annotations.push({
          type: `a11y:${v.impact}`,
          description: `${v.id} — ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"})`,
        });
      }

      if (blocking.length > 0) {
        const summary = blocking
          .map((v) => {
            const nodes = v.nodes
              .slice(0, 3)
              .map((n) => `    - ${n.target.join(" ")}`)
              .join("\n");
            return `  [${v.impact}] ${v.id}: ${v.help}\n${nodes}`;
          })
          .join("\n");
        throw new Error(
          `${blocking.length} critical/serious a11y violation${blocking.length === 1 ? "" : "s"} on ${route.path}:\n${summary}`,
        );
      }
    });
  }
});
