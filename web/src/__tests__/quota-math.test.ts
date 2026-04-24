// Unit tests for the effectiveTokensForQuota billing-weight formula (#457).
// Run with: node --experimental-strip-types --test src/__tests__/quota-math.test.ts
// (from the web/ directory)
//
// The function is intentionally duplicated here rather than importing from
// route.ts, since Next.js API routes pull in server-only modules. The logic is
// the single source of truth; the test validates the algorithm, not the import.

import { test } from "node:test";
import assert from "node:assert/strict";

function effectiveTokensForQuota(usage: {
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  noCacheTokens?: number;
}): number {
  const output = usage.outputTokens ?? 0;
  const noCache = usage.noCacheTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  return output + noCache + cacheWrite + Math.round(cacheRead / 10);
}

test("all zeros → 0", () => {
  assert.equal(effectiveTokensForQuota({}), 0);
});

test("output only", () => {
  assert.equal(effectiveTokensForQuota({ outputTokens: 500 }), 500);
});

test("noCache + cacheWrite + output at 1x each", () => {
  assert.equal(
    effectiveTokensForQuota({ outputTokens: 500, noCacheTokens: 1000, cacheWriteTokens: 1000 }),
    2500,
  );
});

test("cache reads are weighted at 1/10", () => {
  // 1000 cacheRead → Math.round(100) = 100
  assert.equal(effectiveTokensForQuota({ cacheReadTokens: 1000 }), 100);
});

test("mixed: output + noCache + cacheWrite + cacheRead", () => {
  // 500 + 1000 + 1000 + Math.round(1000/10) = 2600
  assert.equal(
    effectiveTokensForQuota({
      outputTokens: 500,
      noCacheTokens: 1000,
      cacheWriteTokens: 1000,
      cacheReadTokens: 1000,
    }),
    2600,
  );
});

test("undefined fields treated as 0", () => {
  assert.equal(effectiveTokensForQuota({ outputTokens: undefined, cacheReadTokens: undefined }), 0);
});

test("cacheRead rounding — 5 rounds to 1 (Math.round(0.5))", () => {
  assert.equal(effectiveTokensForQuota({ cacheReadTokens: 5 }), 1);
});

test("cacheRead rounding — 4 rounds to 0", () => {
  assert.equal(effectiveTokensForQuota({ cacheReadTokens: 4 }), 0);
});

test("cacheRead = 15 rounds to 2", () => {
  assert.equal(effectiveTokensForQuota({ cacheReadTokens: 15 }), 2);
});

test("large realistic turn: heavy cache reads", () => {
  // A turn with big system prompt cache hit: 40k cache read, 2k write, 500 noCache, 800 output
  // effective = 800 + 500 + 2000 + Math.round(40000/10) = 800 + 500 + 2000 + 4000 = 7300
  assert.equal(
    effectiveTokensForQuota({
      outputTokens: 800,
      noCacheTokens: 500,
      cacheWriteTokens: 2000,
      cacheReadTokens: 40000,
    }),
    7300,
  );
});
