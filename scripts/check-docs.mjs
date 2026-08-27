#!/usr/bin/env node
/**
 * Assert that the README still describes this repository. Run from the repo root:
 *
 *   node scripts/check-docs.mjs          # report drift, exit 1 if any
 *   node scripts/check-docs.mjs --fix    # rewrite the numbers it can derive
 *
 * WHY THIS EXISTS RATHER THAN ANOTHER ROUND OF CORRECTIONS
 *
 * The README's tool count has now been found wrong twice — #464 in April ("25 built-in tools" next
 * to a file-tree comment saying 16) and #700 in August, by which point the same document claimed
 * **35**, **44**, **30** and **26** tools in four different places while calling three of them
 * "the same N tools". Each time it was corrected by hand, and each time it drifted again as tools
 * were added and removed.
 *
 * A number a human retypes is a number that goes stale. #700 asked for the fix to "end with a
 * check rather than a correction", so these three facts are derived from the repository and
 * asserted in CI:
 *
 *   1. the tool count             — every "N tools" claim must equal `tool(` across lib/tools/
 *   2. the migration summary      — count and newest filename, from supabase/migrations/
 *   3. every path in the file tree must exist
 *
 * (3) is the one that pays for itself. #700 spotted a single deleted route in the tree
 * (`api/chat/route.ts`, gone since #476). There were **thirteen** — including the entire `voice/`
 * directory and `dashboard/sync-button.tsx`, which has been gone since #296 in April. Nobody was
 * ever going to find those by reading.
 *
 * DELIBERATELY NOT CHECKED: that every file in the repo appears in the tree. The tree is a guided
 * tour, not an inventory, and requiring exhaustiveness would fail CI on every new file and get the
 * check disabled — which is the failure mode this whole file exists to avoid.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const README = join(ROOT, "README.md");
const FIX = process.argv.includes("--fix");

const problems = [];
let text = readFileSync(README, "utf8");

// ── 1. Tool count ───────────────────────────────────────────────────────────
// Counted the way a reader would verify it: `tool(` in the files that define them.
const toolDir = join(ROOT, "web/src/lib/tools");
const toolCount = readdirSync(toolDir)
  .filter((f) => f.endsWith(".ts") && !f.startsWith("_"))
  .reduce((n, f) => n + (readFileSync(join(toolDir, f), "utf8").match(/\btool\(/g)?.length ?? 0), 0);

const CLAIM = /\b(\d+)\s+tools\b/g;
const claims = [...text.matchAll(CLAIM)];
const wrong = claims.filter((m) => Number(m[1]) !== toolCount);
if (wrong.length) {
  if (FIX) {
    text = text.replace(CLAIM, `${toolCount} tools`);
  } else {
    problems.push(
      `tool count: README claims ${[...new Set(wrong.map((m) => m[1]))].join(", ")} — actual is ${toolCount}`,
    );
  }
}

// ── 2. Migration summary ────────────────────────────────────────────────────
// The list used to be typed out in full and stopped four months short: 46 entries against 66 real
// files. Filenames in a README serve nobody — the directory is the source of truth — so the tree
// carries a summary line, and the summary is derived.
const migrations = readdirSync(join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const newest = migrations.at(-1);
const SUMMARY = /(└── migrations\/\s+# )(\d+) files, newest (\S+)/;
const want = `${migrations.length} files, newest ${newest}`;
const found = text.match(SUMMARY);
if (!found) {
  problems.push(
    `migrations: the file tree has no summary line. Expected "└── migrations/    # ${want}"`,
  );
} else if (`${found[2]} files, newest ${found[3]}` !== want) {
  if (FIX) text = text.replace(SUMMARY, `$1${want}`);
  else
    problems.push(
      `migrations: README says "${found[2]} files, newest ${found[3]}" — actual is "${want}"`,
    );
}

// ── 3. Every path in the file tree exists ───────────────────────────────────
const lines = text.split("\n");
let start = -1;
for (let i = 0; i < lines.length && start < 0; i++) {
  if (lines[i].trim() !== "## File structure") continue;
  for (let j = i; j < lines.length; j++) {
    if (lines[j].startsWith("```")) {
      start = j + 1;
      break;
    }
  }
}
if (start < 0) {
  problems.push("file tree: no '## File structure' section followed by a code fence");
} else {
  // Depth comes from the indent: four columns per level, drawn as "│   " or "    ".
  const stack = [];
  const missing = [];
  for (let i = start; i < lines.length; i++) {
    if (lines[i].startsWith("```")) break;
    const m = lines[i].match(/^((?:[│|]?[ ]{3,4})*)(?:├──|└──)[ ](\S+)/);
    if (!m) continue; // wrapped comment lines and blank spacers carry no entry
    const depth = Math.round(m[1].length / 4);
    const name = m[2].replace(/\/$/, "");
    stack.length = depth;
    stack[depth] = name;
    const rel = stack.slice(0, depth + 1).join("/");
    // The tree root is the repo itself; a bare "…" placeholder is not a path.
    if (rel.startsWith("mr-bridge-assistant") || name === "…" || name === "...") continue;
    if (!existsSync(join(ROOT, rel))) missing.push(rel);
  }
  if (missing.length) {
    problems.push(
      `file tree: ${missing.length} listed path(s) do not exist:\n    ${missing.join("\n    ")}`,
    );
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (FIX) {
  writeFileSync(README, text);
  const left = problems.filter((p) => p.startsWith("file tree"));
  console.log("README numbers rewritten from the repository.");
  if (left.length) {
    // Paths cannot be fixed automatically: only a human knows whether an entry was deleted (drop
    // the line) or moved (update it).
    console.error(`\n${left.join("\n\n")}\n\nThese need a hand — see above.`);
    process.exit(1);
  }
  process.exit(0);
}

if (problems.length) {
  console.error("README does not match the repository:\n");
  for (const p of problems) console.error(`  - ${p}\n`);
  console.error("Run `node scripts/check-docs.mjs --fix` for the derivable numbers.");
  process.exit(1);
}

console.log(
  `README matches: ${toolCount} tools, ${migrations.length} migrations, file tree paths all exist.`,
);
