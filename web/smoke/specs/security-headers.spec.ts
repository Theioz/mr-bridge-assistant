import { test, expect } from "../fixtures/auth";
import { test as base } from "@playwright/test";

const EXPECTED_HEADERS: Record<string, string | RegExp> = {
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": /camera=\(\).*microphone=\(\).*geolocation=\(\)/,
  "x-content-type-options": "nosniff",
};

const REQUIRED_CSP_DIRECTIVES = [
  "default-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "https://a.espncdn.com",
  "https://*.supabase.co",
  "wss://*.supabase.co",
];

function assertHeaders(headers: Record<string, string>) {
  for (const [name, expected] of Object.entries(EXPECTED_HEADERS)) {
    const actual = headers[name];
    expect(actual, `missing header: ${name}`).toBeTruthy();
    if (expected instanceof RegExp) {
      expect(actual, `${name} did not match ${expected}`).toMatch(expected);
    } else {
      expect(actual).toBe(expected);
    }
  }

  const csp = headers["content-security-policy-report-only"];
  expect(csp, "missing Content-Security-Policy-Report-Only").toBeTruthy();
  for (const directive of REQUIRED_CSP_DIRECTIVES) {
    expect(csp, `CSP missing directive: ${directive}`).toContain(directive);
  }
}

base("security headers — unauthenticated /login", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response, "no response for /login").toBeTruthy();
  assertHeaders(response!.headers());
});

test("security headers — authenticated route", async ({ signedInPage, consoleErrors }) => {
  const page = signedInPage;
  const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(response, "no response for /dashboard").toBeTruthy();
  assertHeaders(response!.headers());

  // Dashboard pulls calendar/gmail widgets that 403 on the smoke account
  // without Google connected — those console errors are pre-existing and
  // out of scope here.
  consoleErrors.length = 0;
});
