// Unit tests for the share-host scope check (lib/share-host.ts).
// Run with: node --experimental-strip-types --test src/__tests__/share-host.test.ts
// (from the web/ directory)
//
// The public share host must serve GET/HEAD /share/* and nothing else, whatever the
// reverse proxy in front of the app lets through.

import assert from "node:assert/strict";
import { test } from "node:test";
import { blockedOnShareHost, shareHostname } from "../lib/share-host.ts";

const SHARE = "share.example.com";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("share pages are served on the share host", () => {
  assert.equal(blockedOnShareHost(SHARE, "/share/library/abc", "GET", SHARE), false);
  assert.equal(blockedOnShareHost(SHARE, "/share/backlog/abc", "HEAD", SHARE), false);
});

test("everything else on the share host is blocked", () => {
  for (const path of [
    "/",
    "/dashboard",
    "/login",
    "/api/backlog/x.png",
    "/api/cron/sync",
    "/share",
  ]) {
    assert.equal(blockedOnShareHost(SHARE, path, "GET", SHARE), true, path);
  }
});

test("non-GET methods are blocked on the share host, even under /share/", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal(blockedOnShareHost(SHARE, "/share/library/abc", method, SHARE), true, method);
  }
});

test("the app host is never affected", () => {
  assert.equal(blockedOnShareHost("app.example.com", "/dashboard", "GET", SHARE), false);
  assert.equal(blockedOnShareHost("app.example.com", "/api/meals/log", "POST", SHARE), false);
});

test("host matching ignores case and port", () => {
  assert.equal(blockedOnShareHost("Share.Example.com:443", "/dashboard", "GET", SHARE), true);
  assert.equal(
    blockedOnShareHost("share.example.com:3000", "/share/library/abc", "GET", SHARE),
    false,
  );
});

test("no share host configured means nothing is blocked", () => {
  assert.equal(blockedOnShareHost(SHARE, "/dashboard", "GET", null), false);
  assert.equal(blockedOnShareHost(null, "/dashboard", "GET", SHARE), false);
});

test("shareHostname is null when unset or when it equals the app host", () => {
  withEnv({ SHARE_BASE_URL: undefined, APP_URL: "https://app.example.com" }, () => {
    assert.equal(shareHostname(), null);
  });
  withEnv({ SHARE_BASE_URL: "https://app.example.com", APP_URL: "https://app.example.com" }, () => {
    assert.equal(shareHostname(), null);
  });
  withEnv({ SHARE_BASE_URL: "not a url", APP_URL: "https://app.example.com" }, () => {
    assert.equal(shareHostname(), null);
  });
});

test("shareHostname returns the dedicated share host", () => {
  withEnv(
    { SHARE_BASE_URL: "https://Share.Example.com/", APP_URL: "https://app.example.com" },
    () => {
      assert.equal(shareHostname(), SHARE);
    },
  );
});
