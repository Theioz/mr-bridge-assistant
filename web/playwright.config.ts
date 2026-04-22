import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Load .env.local then .env from the package root so `npm run smoke:chat`
// works without the user having to `source` or use `node --env-file`. Shell
// env always wins (we only set keys that aren't already defined). Next.js's
// webServer gets env the same way it would under `next dev`.
function loadEnvFile(filename: string): void {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

// Smoke suite lives under ./smoke. Run with `npm run smoke` or `npm run smoke:chat`.
// Required env:
//   SMOKE_TEST_EMAIL, SMOKE_TEST_PASSWORD — dedicated test-account creds.
//   SMOKE_SUPABASE_SERVICE_KEY            — service-role key used only to
//                                            verify chat_messages landed.
//   NEXT_PUBLIC_SUPABASE_URL              — same URL the app uses.
// See docs/smoke-testing.md for the full run-locally guide.
export default defineConfig({
  testDir: "./smoke/specs",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Chat tests mutate a single shared test account; serial execution avoids
  // chat_sessions / chat_messages collisions. Revisit once specs are scoped
  // per-session or per-user.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "smoke/playwright-report" }]],
  outputDir: "smoke/test-results",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
