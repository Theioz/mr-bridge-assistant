#!/usr/bin/env node
// Spawns `next dev` and monitors its RSS. When resident memory crosses
// MAX_RSS_MB it sends SIGTERM (escalating to SIGKILL after 5s grace).
// Bundler is selected by passing --turbopack or --webpack through to next.

import { spawn, execFileSync } from "node:child_process";

const MAX_RSS_MB = Number(process.env.DEV_MAX_RSS_MB ?? 6144);
const POLL_MS = Number(process.env.DEV_POLL_MS ?? 5000);
const WARN_RSS_MB = Math.floor(MAX_RSS_MB * 0.75);

const passthrough = process.argv.slice(2);
const bundlerFlag = passthrough.includes("--webpack")
  ? "--webpack"
  : "--turbopack";
const nextArgs = ["dev", bundlerFlag, ...passthrough.filter((a) => a !== "--webpack" && a !== "--turbopack")];

const child = spawn("next", nextArgs, {
  stdio: "inherit",
  env: process.env,
});

console.error(
  `[watchdog] next dev (${bundlerFlag}) pid=${child.pid} cap=${MAX_RSS_MB}MB poll=${POLL_MS}ms`,
);

let warned = false;
let killing = false;

function rssMb(pid) {
  try {
    const out = execFileSync("ps", ["-o", "rss=", "-p", String(pid)], {
      encoding: "utf8",
    }).trim();
    if (!out) return 0;
    return Math.round(Number(out) / 1024);
  } catch {
    return 0;
  }
}

function killTree(signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {}
  }
}

const timer = setInterval(() => {
  if (killing || child.exitCode !== null) return;
  const rss = rssMb(child.pid);
  if (!rss) return;

  if (rss >= MAX_RSS_MB) {
    killing = true;
    console.error(
      `\n[watchdog] RSS ${rss}MB ≥ cap ${MAX_RSS_MB}MB — terminating dev server`,
    );
    killTree("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) {
        console.error("[watchdog] grace expired — SIGKILL");
        killTree("SIGKILL");
      }
    }, 5000);
  } else if (!warned && rss >= WARN_RSS_MB) {
    warned = true;
    console.error(
      `[watchdog] RSS ${rss}MB ≥ ${WARN_RSS_MB}MB (75% of cap) — restart soon`,
    );
  }
}, POLL_MS);

child.on("exit", (code, signal) => {
  clearInterval(timer);
  if (signal) console.error(`[watchdog] dev server exited via ${signal}`);
  process.exit(code ?? (signal ? 1 : 0));
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    if (!killing) {
      killing = true;
      killTree(sig);
    }
  });
}
