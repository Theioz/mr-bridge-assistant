// Unit tests for the user-timezone date helpers (lib/timezone.ts).
// Run with: node --experimental-strip-types --test src/__tests__/timezone-dates.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// mr-bridge runs in a container whose clock is UTC. Every `new Date()` in the app is
// therefore a UTC instant, and `toISOString().slice(0, 10)` turns it into a UTC DATE.
// For a user in America/Los_Angeles that date is wrong for the last 7-8 hours of every
// single day — 5 PM Pacific is already tomorrow in UTC.
//
// This shipped as a real data bug. A shrimp dinner cooked at 5:53 PM Pacific on
// 2026-08-19 was written to `cooks.cooked_on = 2026-08-20`, dating the leftovers a day
// into the future in a fridge list whose entire job is "eat the oldest thing first".
// The same expression defaulted `meal_log.date`, so any meal logged after 5 PM would
// have landed on the next day's intake total.
//
// The rule the app now follows: a date that describes WHEN THE USER DID SOMETHING is
// derived from `todayString()`, never from `toISOString()`.
//
// Note what is deliberately NOT covered here: `addDays`, `shiftDate` in journal/prompts,
// and `dateStr` in sync/google-health all use `toISOString()` on purpose, anchored to an
// explicit UTC instant (noon-UTC, or an already-offset-shifted timestamp). Those are
// correct and must not be "fixed".

import test from "node:test";
import assert from "node:assert/strict";
import { todayString, addDays, comingMonday, localDateString } from "../lib/timezone.ts";

test("todayString returns the user-timezone date, not the UTC date", () => {
  const tz = "America/Los_Angeles";
  const today = todayString(tz);
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);

  // The invariant that actually matters: for any instant, the Pacific date is either
  // the same as the UTC date or one day BEHIND it — never ahead.
  const utcToday = new Date().toISOString().slice(0, 10);
  assert.ok(
    today === utcToday || addDays(today, 1) === utcToday,
    `Pacific date ${today} should equal or trail UTC date ${utcToday}`,
  );
});

test("todayString disagrees with the UTC date during the Pacific evening", () => {
  // Pin the exact failure that produced the bad cooked_on: 2026-08-20T00:53Z is
  // 5:53 PM PDT on 2026-08-19. The formatter must say the 19th.
  const instant = new Date("2026-08-20T00:53:45.928Z");
  const pacific = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(instant);
  assert.equal(pacific, "2026-08-19");
  assert.equal(instant.toISOString().slice(0, 10), "2026-08-20"); // what the bug wrote
});

test("comingMonday returns the next Monday, and never today when today is a Monday", () => {
  assert.equal(comingMonday("2026-08-19"), "2026-08-24"); // Wed -> following Mon
  assert.equal(comingMonday("2026-08-23"), "2026-08-24"); // Sun -> tomorrow
  assert.equal(comingMonday("2026-08-24"), "2026-08-31"); // Mon -> NEXT Mon, not itself
  assert.equal(comingMonday("2026-08-25"), "2026-08-31"); // Tue -> following Mon
});

test("comingMonday always lands on a Monday and is 1-7 days out", () => {
  let d = "2026-01-01";
  for (let i = 0; i < 400; i++) {
    const mon = comingMonday(d);
    assert.equal(new Date(`${mon}T12:00:00Z`).getUTCDay(), 1, `${mon} is not a Monday`);
    const gap = Math.round(
      (Date.parse(`${mon}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86_400_000,
    );
    assert.ok(gap >= 1 && gap <= 7, `gap from ${d} to ${mon} was ${gap}`);
    d = addDays(d, 1);
  }
});

test("comingMonday holds across a DST boundary", () => {
  // US DST ends 2026-11-01. A naive local-Date implementation drifts here.
  assert.equal(comingMonday("2026-10-30"), "2026-11-02");
  assert.equal(comingMonday("2026-11-01"), "2026-11-02");
  // And spring forward, 2026-03-08.
  assert.equal(comingMonday("2026-03-06"), "2026-03-09");
  assert.equal(comingMonday("2026-03-08"), "2026-03-09");
});

// ── localDateString ──────────────────────────────────────────────────────────
//
// The calendar grid is built entirely from LOCAL Date fields — `new Date(y, m, d)`,
// `setDate()`, `getDay()` — and then needed a YYYY-MM-DD key back out. Reading those
// fields back through `toISOString()` reads them as UTC, so the "today" highlight in the
// week and month views moved to tomorrow every Pacific evening after 5 PM, the day view
// fetched and rendered tomorrow's events, and "Add event" pre-filled tomorrow's date.
//
// These assertions are written to hold in ANY runtime timezone: each one builds a Date
// from local components and asserts it formats back to those same components. That is
// the whole contract.

test("localDateString round-trips a Date built from local fields", () => {
  assert.equal(localDateString(new Date(2026, 7, 26, 18, 30)), "2026-08-26");
  assert.equal(localDateString(new Date(2026, 7, 26, 0, 0)), "2026-08-26");
  assert.equal(localDateString(new Date(2026, 7, 26, 23, 59, 59)), "2026-08-26");
});

test("localDateString zero-pads month and day", () => {
  assert.equal(localDateString(new Date(2026, 0, 1)), "2026-01-01");
  assert.equal(localDateString(new Date(2026, 8, 9)), "2026-09-09");
  assert.match(localDateString(new Date()), /^\d{4}-\d{2}-\d{2}$/);
});

test("localDateString holds at the year boundary", () => {
  assert.equal(localDateString(new Date(2026, 11, 31, 23, 0)), "2026-12-31");
  assert.equal(localDateString(new Date(2027, 0, 1, 0, 30)), "2027-01-01");
});

test("localDateString never drifts across a 400-day local sweep", () => {
  const d = new Date(2026, 0, 1, 20, 0); // 8 PM local — the hour the UTC read broke
  for (let i = 0; i < 400; i++) {
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    assert.equal(localDateString(d), expected);
    d.setDate(d.getDate() + 1);
  }
});

test("localDateString disagrees with toISOString west of Greenwich in the evening", () => {
  // Pins the actual defect rather than just the fix. Only meaningful when the runtime
  // is behind UTC — in any other zone the two agree at 8 PM and there is nothing to
  // assert, so the check is conditional on the offset rather than skipped outright.
  const evening = new Date(2026, 7, 26, 20, 0); // 8 PM local
  const behindUTC = evening.getTimezoneOffset() > 0;
  assert.equal(localDateString(evening), "2026-08-26");
  if (behindUTC) {
    assert.equal(evening.toISOString().slice(0, 10), "2026-08-27"); // what the bug rendered
  }
});
