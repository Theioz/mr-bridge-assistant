// Unit tests for the share-link builders (lib/share-url.ts).
// Run with: node --experimental-strip-types --test src/__tests__/share-url.test.ts
// (from the web/ directory)
//
// On 2026-10-12 the Library's "Share library" link came out on the tailnet origin: the client
// built it from `window.location.origin`, and the item detail page from `APP_URL`, while the API
// routes used `shareBaseUrl()`. Every share link now comes from these builders.

import assert from "node:assert/strict";
import { test } from "node:test";
import { itemShareUrl, libraryShareUrl, shareBaseUrl } from "../lib/share-url.ts";

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

test("SHARE_BASE_URL wins over the tailnet APP_URL", () => {
  withEnv(
    { SHARE_BASE_URL: "https://share.example.com/", APP_URL: "https://app.tailnet.ts.net" },
    () => {
      assert.equal(shareBaseUrl(), "https://share.example.com");
      assert.equal(libraryShareUrl("tok"), "https://share.example.com/share/library/tok");
      assert.equal(itemShareUrl("tok"), "https://share.example.com/share/backlog/tok");
    },
  );
});

test("an explicit base (resolved on the server, passed to a client) is used as given", () => {
  assert.equal(
    libraryShareUrl("abc", "https://share.example.com"),
    "https://share.example.com/share/library/abc",
  );
  assert.equal(
    itemShareUrl("abc", "https://share.example.com"),
    "https://share.example.com/share/backlog/abc",
  );
});

test("tokens are path-encoded", () => {
  assert.equal(libraryShareUrl("a/b", "https://s"), "https://s/share/library/a%2Fb");
});
