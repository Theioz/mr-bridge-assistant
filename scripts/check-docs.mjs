#!/usr/bin/env node
/**
 * Assert that the documentation still describes this repository. Run from anywhere:
 *
 *   node scripts/check-docs.mjs          # report drift, exit 1 if any
 *   node scripts/check-docs.mjs --fix    # rewrite the tool counts it can derive
 *
 * WHY THIS EXISTS RATHER THAN ANOTHER ROUND OF CORRECTIONS
 *
 * A fact a human retypes goes stale. The README's tool count was found wrong twice (#464, #700);
 * a documentation audit then found the same class of drift in every place this script did not
 * look: the nutrition model described three ways, an env file model that matched no machine, a
 * retired Postgres minor version in six places, issue numbers that resolve to the wrong issue.
 * Each check below derives a fact from the repository, or bans a statement known to be false.
 *
 *   1. tool count     every "N tools" claim equals `tool(` across web/src/lib/tools/
 *   2. migrations     every "N migrations" claim equals the files in supabase/migrations/
 *   3. paths          every repo path written in backticks exists
 *   4. env vars       code reads vs the two example files, both directions
 *   5. stale terms    statements that used to be true
 *   6. issue refs     bare numbers that mean an issue in another, private repository
 *   7. links          relative links and #anchors resolve
 *   8. hostnames      the real deployment domain and SSH login never appear in docs
 *
 * It depends on nothing but Node: no npm install, so it stays the cheapest job in CI.
 *
 * HISTORICAL FILES are records of a past state and are exempt from 1-3 and 5-7 (never from 8,
 * except the three directories below, which predate the rule): docs/history/, docs/audits/,
 * docs/design/, and CHANGELOG.md, whose released entries name things that have since been removed.
 *
 * DELIBERATELY NOT CHECKED: that every file in the repo is documented. Requiring exhaustiveness
 * would fail CI on every new file and get the check disabled.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = process.argv.includes("--fix");
const problems = [];

// ── File sets ───────────────────────────────────────────────────────────────
// Vendored or generated trees: not ours to keep accurate.
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".venv",
  "build",
  "dist",
  ".gradle",
  "perf-report",
  "playwright-report",
  "test-results",
]);
const SKIP_PREFIXES = [".claude/references/", ".claude/skills/ui-ux-pro-max/", ".claude/worktrees/"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    const rel = relative(ROOT, abs).split(sep).join("/");
    if (SKIP_PREFIXES.some((p) => (rel + "/").startsWith(p))) continue;
    const st = statSync(abs, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) walk(abs, out);
    else out.push(rel);
  }
  return out;
}

const ALL = walk(ROOT);
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const HISTORICAL_DIRS = ["docs/history/", "docs/audits/", "docs/design/"];
const inHistoryDir = (f) => HISTORICAL_DIRS.some((d) => f.startsWith(d));
const isHistorical = (f) => inHistoryDir(f) || f === "CHANGELOG.md";

const MD = ALL.filter((f) => f.endsWith(".md"));
const EXAMPLES = ALL.filter((f) => f.endsWith(".example"));
const CURRENT_MD = MD.filter((f) => !isHistorical(f));
/** Docs that must describe the present: current markdown plus the env templates. */
const CURRENT_DOCS = [...CURRENT_MD, ...EXAMPLES];

/** Line numbers that sit inside a ``` fence, so prose checks can skip code samples. */
function fencedLines(text) {
  const inside = new Set();
  let open = false;
  text.split("\n").forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      open = !open;
      inside.add(i);
    } else if (open) inside.add(i);
  });
  return inside;
}

// ── 1. Tool count ───────────────────────────────────────────────────────────
// Counted the way a reader would verify it: `tool(` in the files that define them.
const toolDir = join(ROOT, "web/src/lib/tools");
const toolCount = readdirSync(toolDir)
  .filter((f) => f.endsWith(".ts") && !f.startsWith("_"))
  .reduce((n, f) => n + (readFileSync(join(toolDir, f), "utf8").match(/\btool\(/g)?.length ?? 0), 0);

const TOOL_CLAIM = /\b(\d+)(\*{0,2})\s+tools\b/g;
for (const f of CURRENT_MD) {
  const text = read(f);
  const wrong = [...text.matchAll(TOOL_CLAIM)].filter((m) => Number(m[1]) !== toolCount);
  if (!wrong.length) continue;
  if (FIX) writeFileSync(join(ROOT, f), text.replace(TOOL_CLAIM, `${toolCount}$2 tools`));
  else
    problems.push(
      `tool count: ${f} claims ${[...new Set(wrong.map((m) => m[1]))].join(", ")}; actual is ${toolCount}`,
    );
}

// ── 2. Migration count ──────────────────────────────────────────────────────
// No document needs to state this. If one does, it has to be right.
const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
const MIGRATION_CLAIM = /\b(\d+)\s+migrations\b/g;
for (const f of CURRENT_MD) {
  for (const m of read(f).matchAll(MIGRATION_CLAIM)) {
    if (Number(m[1]) !== migrations.length)
      problems.push(`migrations: ${f} claims ${m[1]}; actual is ${migrations.length}`);
  }
}

// ── 3. Every repo path written in backticks exists ──────────────────────────
// Generalises the old README file-tree check: that tree listed thirteen deleted paths before
// anyone noticed. A path is checked when it starts at a top-level directory of this repo.
const PATH_ROOTS = [
  "web/",
  "scripts/",
  "docs/",
  "supabase/",
  "android/",
  "tests/",
  "design-system/",
  ".claude/",
  ".github/",
];
// Paths that are real but untracked (created per machine or by a build), with the reason.
const PATH_ALLOW = new Set([
  "web/.env.local", // per-machine dev env, gitignored
  "web/.env", // optional second dotenv file Playwright loads
  "web/smoke/perf-report", // Lighthouse output, gitignored
  "web/smoke/test-results", // Playwright output, gitignored
  "web/smoke/playwright-report", // Playwright output, gitignored
  "web/node_modules", // npm install output
  "web/.next", // build output
  "android/native/app/build", // Gradle output
  ".claude/settings.local.json", // per-machine Claude Code settings, gitignored
  ".claude/memory", // lives in the private deployment repo, named here only as a location
  ".claude/memory/mrbridge",
  ".claude/memory/mrbridge/README.md",
  "docs/runbooks/secret-rotation-YYYY-MM.md", // naming pattern for a future rotation log
  "android/keystore.properties", // signing config, never committed
]);
const CODE_SPAN = /`([^`\n]+)`/g;
for (const f of CURRENT_MD) {
  const missing = new Set();
  for (const m of read(f).matchAll(CODE_SPAN)) {
    let p = m[1].trim();
    if (!PATH_ROOTS.some((r) => p.startsWith(r))) continue;
    if (/[\s<>*{}…|$=,;]|\.\.\./.test(p)) continue; // commands, globs, placeholders
    p = p.replace(/[:#]L?\d+(-L?\d+)?$/, "").replace(/\/$/, ""); // drop a :line suffix
    if (PATH_ALLOW.has(p) || [...PATH_ALLOW].some((a) => p.startsWith(a + "/"))) continue;
    if (!existsSync(join(ROOT, p))) missing.add(p);
  }
  if (missing.size)
    problems.push(`paths: ${f} names path(s) that do not exist:\n      ${[...missing].join("\n      ")}`);
}

// ── 4. Env vars: what the code reads vs what the example files document ─────
// Read by code: process.env.X under web/ and scripts/, os.environ / os.getenv under scripts/.
const ENV_EXAMPLE_FILES = [".env.example", "web/.env.local.example"];
// Read by code, deliberately absent from the example files. Each entry carries its reason.
const ENV_NOT_DOCUMENTED = {
  NODE_ENV: "set by Node / Next.js",
  NEXT_RUNTIME: "set by Next.js",
  CI: "set by the CI runner",
  HOME: "shell",
  ANALYZE: "dev-only: bundle analyzer switch (next.config.ts)",
  DEV_MAX_RSS_MB: "dev-only: scripts/dev-watchdog.mjs",
  DEV_POLL_MS: "dev-only: scripts/dev-watchdog.mjs",
  SMOKE_TEST_EMAIL: "smoke tests only; documented in docs/smoke-testing.md",
  SMOKE_TEST_PASSWORD: "smoke tests only; documented in docs/smoke-testing.md",
  SMOKE_SUPABASE_SERVICE_KEY: "read only by an unused smoke helper (web/smoke/utils/supabase-verify.ts)",
  PERF_ROUTES: "smoke perf run only; documented in docs/smoke-testing.md",
  PERF_TARGET: "smoke perf run only; documented in docs/smoke-testing.md",
  HEARTBEAT_MSG_FILE: "set by the host's cron heartbeat wrapper, not by an env file",
  GOOGLE_REFRESH_TOKEN: "read only by the one-shot scripts/seed-owner-google-integration.ts",
};
// Documented in an example file but read through a path this scan cannot see.
const ENV_NOT_READ = {};

const envRead = new Map(); // name -> first file that reads it
const note = (name, file) => envRead.has(name) || envRead.set(name, file);
for (const f of ALL) {
  const js = /\.(ts|tsx|mts|mjs|js|cjs)$/.test(f) && (f.startsWith("web/") || f.startsWith("scripts/"));
  const py = f.endsWith(".py") && f.startsWith("scripts/");
  if (!js && !py) continue;
  if (f === "scripts/check-docs.mjs") continue;
  const src = read(f);
  if (js) {
    for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) note(m[1], f);
    for (const m of src.matchAll(/process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g)) note(m[1], f);
  } else {
    for (const m of src.matchAll(/os\.environ(?:\.get)?[\[(]\s*["']([A-Z][A-Z0-9_]*)["']/g)) note(m[1], f);
    for (const m of src.matchAll(/os\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']/g)) note(m[1], f);
  }
}
const envDocumented = new Set();
for (const f of ENV_EXAMPLE_FILES) {
  // Active (`NAME=`) and commented-out optional (`# NAME=`) assignments both count as documented.
  for (const m of read(f).matchAll(/^#?\s?([A-Z][A-Z0-9_]*)=/gm)) envDocumented.add(m[1]);
}
const undocumented = [...envRead.keys()]
  .filter((n) => !envDocumented.has(n) && !(n in ENV_NOT_DOCUMENTED))
  .sort();
const unread = [...envDocumented].filter((n) => !envRead.has(n) && !(n in ENV_NOT_READ)).sort();
if (undocumented.length)
  problems.push(
    `env vars: read by code but in neither ${ENV_EXAMPLE_FILES.join(" nor ")}:\n      ` +
      undocumented.map((n) => `${n}  (${envRead.get(n)})`).join("\n      ") +
      `\n    Document it, or add it to ENV_NOT_DOCUMENTED in scripts/check-docs.mjs with a reason.`,
  );
if (unread.length)
  problems.push(
    `env vars: documented in an example file but read by no code:\n      ${unread.join("\n      ")}\n    Remove it from the example file.`,
  );

// ── 5. Stale terms ──────────────────────────────────────────────────────────
// Each of these was true once and survived in a document after it stopped being true.
const STALE = [
  { re: /No Anthropic/i, why: "the nutrition model is Claude via the API when keyed (#790)" },
  { re: /zero-Anthropic/i, why: "same" },
  { re: /5-prompt/i, why: "the journal is free-write with up to 3 contextual prompts" },
  { re: /Oura PAT/i, why: "Oura uses OAuth2 (#732)" },
  { re: /Fitbit/i, why: "replaced by Google Health (#607); history belongs in CHANGELOG.md" },
  { re: /Vercel/i, why: "the app is self-hosted; history belongs in CHANGELOG.md" },
  // "17.6g" is a nutrition figure in ARCHITECTURE.md, not a version.
  { re: /\b17\.6\b(?!\s?g\b)/, why: "a retired Postgres minor version; write the major only" },
];
for (const f of CURRENT_DOCS) {
  read(f)
    .split("\n")
    .forEach((line, i) => {
      for (const { re, why } of STALE) {
        const m = line.match(re);
        if (m) problems.push(`stale term: ${f}:${i + 1} "${m[0]}" (${why})`);
      }
    });
}

// ── 6. Issue references that mean another repository ────────────────────────
// The self-hosting migration and the cloud decommission were tracked in the private deployment
// repo. Their bare numbers resolve to unrelated items here, so they are written as plain text.
const FOREIGN_ISSUES = /(?<![\w/-])#(476|514)\b/;
for (const f of CURRENT_DOCS) {
  read(f)
    .split("\n")
    .forEach((line, i) => {
      const m = line.match(FOREIGN_ISSUES);
      if (m)
        problems.push(
          `issue ref: ${f}:${i + 1} "${m[0]}" is an issue in another repository; say what it was in words`,
        );
    });
}

// ── 7. Relative links and anchors ───────────────────────────────────────────
/** GitHub's heading-to-anchor rule, including the -1, -2 suffix for repeats. */
function anchorsOf(text) {
  const seen = new Map();
  const out = new Set();
  const fenced = fencedLines(text);
  text.split("\n").forEach((line, i) => {
    if (fenced.has(i)) return;
    const m = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) return;
    const base = m[1]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // link text only
      .replace(/[`*_]/g, (c) => (c === "_" ? "_" : ""))
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  });
  return out;
}
const anchorCache = new Map();
const anchorsFor = (rel) => {
  if (!anchorCache.has(rel)) anchorCache.set(rel, anchorsOf(read(rel)));
  return anchorCache.get(rel);
};
// CHANGELOG.md is checked too: its dead links were the largest single class the audit found.
for (const f of MD.filter((x) => !inHistoryDir(x))) {
  const text = read(f);
  const fenced = fencedLines(text);
  const bad = [];
  text.split("\n").forEach((line, i) => {
    if (fenced.has(i)) return;
    const prose = line.replace(/`[^`]*`/g, ""); // a link shown as code is not a link
    for (const m of prose.matchAll(/\[[^\]]*\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|tel:)/i.test(target)) continue;
      const [pathPart, anchor] = target.split("#");
      const destRel = pathPart
        ? relative(ROOT, join(ROOT, dirname(f), decodeURIComponent(pathPart))).split(sep).join("/")
        : f;
      if (pathPart && !existsSync(join(ROOT, destRel))) {
        bad.push(`${f}:${i + 1} -> ${target} (no such file)`);
        continue;
      }
      if (anchor && destRel.endsWith(".md") && !anchorsFor(destRel).has(anchor.toLowerCase()))
        bad.push(`${f}:${i + 1} -> ${target} (no such heading)`);
    }
  });
  if (bad.length) problems.push(`links: ${bad.length} broken in ${f}:\n      ${bad.join("\n      ")}`);
}

// ── 8. Real hostnames and logins ────────────────────────────────────────────
// This repository is public. Docs and templates use <your-domain> / <user>@<host>.
const PRIVATE = [
  { re: /jl-infra-lab\.com/i, why: "the real deployment domain; write <your-domain>" },
  { re: /\btheioz@|\bjasonhomelab\b/, why: "a real SSH login or host alias; write <user>@<host>" },
];
for (const f of [...MD, ...EXAMPLES].filter((x) => !inHistoryDir(x))) {
  read(f)
    .split("\n")
    .forEach((line, i) => {
      for (const { re, why } of PRIVATE) {
        const m = line.match(re);
        if (m) problems.push(`hostname: ${f}:${i + 1} "${m[0]}" (${why})`);
      }
    });
}

// ── Report ──────────────────────────────────────────────────────────────────
if (FIX) {
  console.log(`Tool counts rewritten to ${toolCount}. Everything else needs a hand.`);
  process.exit(0);
}

if (problems.length) {
  console.error(`Documentation does not match the repository (${problems.length} problem(s)):\n`);
  for (const p of problems) console.error(`  - ${p}\n`);
  console.error("`node scripts/check-docs.mjs --fix` rewrites tool counts; the rest is a judgement.");
  process.exit(1);
}

console.log(
  `Docs match: ${toolCount} tools, ${migrations.length} migrations, ` +
    `${CURRENT_DOCS.length} current docs, ${envRead.size} env vars read by code.`,
);
