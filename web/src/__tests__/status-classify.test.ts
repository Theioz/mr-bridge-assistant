// Unit tests for the Status page's job classification (#761).
// Run with: node --experimental-strip-types --test src/__tests__/status-classify.test.ts
//
// WHY: the Status page exists to tell "nothing to do" apart from "it broke". The cases that
// matter are a job that silently stopped (stale, though it never logged an error) and a job that
// is still inside its window but whose latest run failed.

import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, type JobDef } from "../lib/status/classify.ts";

const job: JobDef = { source: "cron:x", label: "X", schedule: "daily", maxAgeHours: 48 };
const now = new Date("2026-10-13T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

test("a job that never ran is 'never', not 'ok'", () => {
  assert.equal(classify(job, null, null, now), "never");
});

test("a recent success is ok", () => {
  const t = hoursAgo(10);
  assert.equal(classify(job, t, { at: t, status: "ok" }, now), "ok");
});

test("a job that quietly stopped goes stale without ever logging an error", () => {
  const t = hoursAgo(49);
  assert.equal(classify(job, t, { at: t, status: "ok" }, now), "stale");
});

test("a recent failure after a recent success is 'failing' before it can go stale", () => {
  assert.equal(classify(job, hoursAgo(20), { at: hoursAgo(2), status: "error" }, now), "failing");
});

test("only failures and no success ever is stale (it has never worked)", () => {
  assert.equal(classify(job, null, { at: hoursAgo(1), status: "error" }, now), "stale");
});
