/**
 * Lighthouse perf smoke — runs CWV-style lab checks against each of the 11
 * routes from #323 (mobile + desktop) and fails the process if any metric
 * exceeds the thresholds Jason set during Gate B.
 *
 * INP is a field metric and cannot be measured in a lab. Lighthouse's
 * published proxy is TBT (Total Blocking Time) — we gate TBT < 200ms as the
 * INP surrogate. See https://web.dev/articles/inp for the correlation study.
 */

import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import lighthouse, { desktopConfig, generateReport } from "lighthouse";
import type LHResult from "lighthouse/types/lhr/lhr";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = "http://localhost:3000";
const DEBUG_PORT = 9222;
const RUNS_PER_METRIC = 3;
const REPORT_DIR = path.resolve("smoke/perf-report");
const USER_DATA_DIR = path.resolve("smoke/test-results/.perf-userdata");
const BASELINES_PATH = path.resolve("smoke/perf/baselines.json");

const THRESHOLDS = {
  cls: 0.1,     // unitless
  lcp: 2_500,   // ms
  tbt: 200,     // ms — INP proxy
} as const;

type MetricKey = keyof typeof THRESHOLDS;

// Per-route baselines are consulted when a metric exceeds its hard threshold.
// The gate is: value <= max(threshold, baseline). This lets the sweep ship
// today (with known-bad routes documented) and still catch regressions past
// the current floor. File shape is validated at load time. See #384 for the
// ratchet-down plan.
type Baselines = {
  _comment?: string;
  routes: Record<string, Partial<Record<Preset, Partial<Record<MetricKey, number>>>>>;
};

function loadBaselines(): Baselines {
  if (!fs.existsSync(BASELINES_PATH)) return { routes: {} };
  return JSON.parse(fs.readFileSync(BASELINES_PATH, "utf8")) as Baselines;
}

type Preset = "mobile" | "desktop";

const ROUTES = [
  "/dashboard",
  "/chat",
  "/fitness",
  "/habits",
  "/tasks",
  "/weekly",
  "/journal",
  "/meals",
  "/notifications",
  "/settings",
  "/login",
] as const;

type RouteMetrics = { cls: number; lcp: number; tbt: number; status: "pass" | "fail"; breaches: string[] };
type RouteSummary = { path: string; mobile: RouteMetrics; desktop: RouteMetrics };

function loadEnvFile(filename: string): void {
  const filePath = path.resolve(filename);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required. See docs/smoke-testing.md.`);
  return v;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function assertDevServer(): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/login`);
    if (!res.ok) throw new Error(`got ${res.status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Dev server not reachable on ${BASE_URL} (${msg}). Run 'npm run dev' in another terminal and retry.`,
    );
  }
}

async function signIn(context: BrowserContext): Promise<void> {
  // Selectors mirror web/smoke/fixtures/auth.ts — source of truth for the
  // sign-in flow. If you update one, update both.
  const email = requireEnv("SMOKE_TEST_EMAIL");
  const password = requireEnv("SMOKE_TEST_PASSWORD");
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|chat)/, { timeout: 20_000 });
  await page.close();
}

// Pre-compile every route in dev mode. Without this, the first Lighthouse
// run against an uncompiled route captures the webpack/turbopack compile
// latency (adds 2-4s to LCP), not the real page performance. In prod
// (`next start`) this is a no-op.
async function warmRoutes(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  for (const routePath of ROUTES) {
    try {
      await page.goto(`${BASE_URL}${routePath}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch {
      // Warm-up failures shouldn't abort the whole run — Lighthouse itself
      // surfaces the problem more clearly than a goto timeout.
    }
  }
  await page.close();
}

async function runLighthouse(url: string, preset: Preset): Promise<LHResult> {
  const config = preset === "desktop" ? desktopConfig : undefined;
  const result = await lighthouse(
    url,
    {
      port: DEBUG_PORT,
      output: ["json", "html"],
      logLevel: "error",
      onlyCategories: ["performance"],
    },
    config,
  );
  if (!result) throw new Error(`Lighthouse returned no result for ${url} (${preset})`);
  return result.lhr;
}

function extractMetrics(lhr: LHResult): { cls: number; lcp: number; tbt: number } {
  const audit = (id: string): number => {
    const a = lhr.audits[id];
    if (!a || typeof a.numericValue !== "number") {
      throw new Error(`Missing audit ${id} in Lighthouse result`);
    }
    return a.numericValue;
  };
  return {
    cls: audit("cumulative-layout-shift"),
    lcp: audit("largest-contentful-paint"),
    tbt: audit("total-blocking-time"),
  };
}

function checkThresholds(
  m: { cls: number; lcp: number; tbt: number },
  routePath: string,
  preset: Preset,
  baselines: Baselines,
): { status: "pass" | "fail"; breaches: string[] } {
  const baseline = baselines.routes[routePath]?.[preset] ?? {};
  const breaches: string[] = [];
  const check = (key: MetricKey, value: number, fmt: (v: number) => string, unit: string) => {
    const effective = Math.max(THRESHOLDS[key], baseline[key] ?? -Infinity);
    if (value < effective) return;
    const threshold = THRESHOLDS[key];
    const base = baseline[key];
    const gate = base !== undefined && base > threshold
      ? `baseline ${fmt(base)}${unit}`
      : `${fmt(threshold)}${unit}`;
    breaches.push(`${key.toUpperCase()} ${fmt(value)}${unit} >= ${gate}`);
  };
  check("cls", m.cls, (v) => v.toFixed(3), "");
  check("lcp", m.lcp, (v) => String(Math.round(v)), "ms");
  check("tbt", m.tbt, (v) => String(Math.round(v)), "ms");
  return { status: breaches.length === 0 ? "pass" : "fail", breaches };
}

function resetReportDir(): void {
  fs.rmSync(REPORT_DIR, { recursive: true, force: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

function resetUserDataDir(): void {
  fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

function reportSlug(routePath: string, preset: Preset): string {
  const safe = routePath === "/" ? "root" : routePath.replace(/^\//, "").replace(/\//g, "-");
  return `${safe}-${preset}`;
}

async function runRoutePreset(routePath: string, preset: Preset, baselines: Baselines): Promise<RouteMetrics> {
  const url = `${BASE_URL}${routePath}`;
  const samples: { cls: number; lcp: number; tbt: number }[] = [];
  let lastLhr: LHResult | undefined;
  for (let i = 0; i < RUNS_PER_METRIC; i++) {
    const lhr = await runLighthouse(url, preset);
    samples.push(extractMetrics(lhr));
    lastLhr = lhr;
  }
  const metrics = {
    cls: median(samples.map((s) => s.cls)),
    lcp: median(samples.map((s) => s.lcp)),
    tbt: median(samples.map((s) => s.tbt)),
  };
  if (lastLhr) {
    // Write the last run's HTML report — sufficient as an artifact; the
    // median is in summary.json.
    const html = generateReport(lastLhr, "html");
    fs.writeFileSync(path.join(REPORT_DIR, `${reportSlug(routePath, preset)}.html`), html as string);
  }
  return { ...metrics, ...checkThresholds(metrics, routePath, preset, baselines) };
}

function renderTable(summary: { routes: RouteSummary[]; overallStatus: "pass" | "fail" }): string {
  const rows = summary.routes.map((r) => {
    const mark = (x: RouteMetrics) => (x.status === "pass" ? "PASS" : "FAIL");
    return `  ${r.path.padEnd(15)}  mobile ${mark(r.mobile)}  desktop ${mark(r.desktop)}`;
  });
  const fails = summary.routes
    .flatMap((r) => [
      ...(r.mobile.status === "fail" ? [`  ${r.path} mobile: ${r.mobile.breaches.join(", ")}`] : []),
      ...(r.desktop.status === "fail" ? [`  ${r.path} desktop: ${r.desktop.breaches.join(", ")}`] : []),
    ])
    .join("\n");
  const header = `\nLighthouse perf sweep — thresholds: CLS < ${THRESHOLDS.cls}, LCP < ${THRESHOLDS.lcp}ms, TBT < ${THRESHOLDS.tbt}ms (INP proxy)`;
  return [header, ...rows, "", fails ? `Failures:\n${fails}` : "All routes within threshold.", ""].join("\n");
}

async function main(): Promise<void> {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  await assertDevServer();

  resetReportDir();
  resetUserDataDir();

  const baselines = loadBaselines();

  // launchPersistentContext persists cookies in the user-data-dir, so the
  // new tab Lighthouse opens is authenticated from the same cookie jar.
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    args: [`--remote-debugging-port=${DEBUG_PORT}`],
    headless: true,
  });
  const browser: Browser | null = context.browser();
  const started = Date.now();
  try {
    await signIn(context);
    process.stderr.write("  warming routes…\n");
    await warmRoutes(context);
    const results: RouteSummary[] = [];
    for (const routePath of ROUTES) {
      process.stderr.write(`  auditing ${routePath}…\n`);
      const mobile = await runRoutePreset(routePath, "mobile", baselines);
      const desktop = await runRoutePreset(routePath, "desktop", baselines);
      results.push({ path: routePath, mobile, desktop });
    }
    const overallStatus = results.every((r) => r.mobile.status === "pass" && r.desktop.status === "pass") ? "pass" : "fail";
    const summary = {
      runAt: new Date().toISOString(),
      durationSec: Math.round((Date.now() - started) / 1000),
      thresholds: THRESHOLDS,
      baselines: baselines.routes,
      runsPerMetric: RUNS_PER_METRIC,
      routes: results,
      overallStatus,
    };
    fs.writeFileSync(path.join(REPORT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
    process.stdout.write(renderTable({ routes: results, overallStatus }));
    if (overallStatus === "fail") process.exit(1);
  } finally {
    await context.close();
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
