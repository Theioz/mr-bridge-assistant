// Unit tests for travel mode's "find the stay" rule (lib/travel/stay.ts).
// Run with: node --experimental-strip-types --test src/__tests__/travel-stay.test.ts
// (from the web/ directory)
//
// The Python morning summary mirrors this in scripts/_travel.py (tests/test_travel.py pins the
// same cases), so the dashboard and the push agree on whether you're away.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addressCountry,
  findCurrentStay,
  geocodeCandidates,
  stayCity,
} from "../lib/travel/stay.ts";

const WESTIN = {
  summary: "Stay at The Westin Melbourne",
  location: "The Westin Melbourne, 205 Collins St, Melbourne VIC 3000, Australia",
  start: { date: "2026-10-10" },
  end: { date: "2026-10-16" }, // Google's all-day end is exclusive → last day is the 15th
};

test("all-day stay covering today", () => {
  assert.deepEqual(findCurrentStay([WESTIN], "2026-10-12"), {
    name: "The Westin Melbourne",
    location: WESTIN.location,
    start: "2026-10-10",
    end: "2026-10-15",
  });
});

test("first and last covered day count; the exclusive end does not", () => {
  assert.ok(findCurrentStay([WESTIN], "2026-10-10"));
  assert.ok(findCurrentStay([WESTIN], "2026-10-15"));
  assert.equal(findCurrentStay([WESTIN], "2026-10-16"), null);
  assert.equal(findCurrentStay([WESTIN], "2026-10-09"), null);
});

test("title must START with 'Stay at' (case-insensitive)", () => {
  const base = { start: { date: "2026-10-12" }, end: { date: "2026-10-13" } };
  assert.ok(findCurrentStay([{ ...base, summary: "stay at Hotel Kyoto" }], "2026-10-12"));
  assert.equal(
    findCurrentStay([{ ...base, summary: "Dinner at the Stay at Home Café" }], "2026-10-12"),
    null,
  );
  assert.equal(
    findCurrentStay([{ ...base, summary: "Offsite", location: "Hilton Austin" }], "2026-10-12"),
    null,
  );
});

test("cancelled events are ignored", () => {
  assert.equal(findCurrentStay([{ ...WESTIN, status: "cancelled" }], "2026-10-12"), null);
});

test("changeover day: the stay that started later wins (that's where tonight is)", () => {
  const next = {
    summary: "Stay at Park Hyatt Sydney",
    location: "7 Hickson Rd, The Rocks NSW 2000, Australia",
    start: { date: "2026-10-15" },
    end: { date: "2026-10-18" },
  };
  assert.equal(findCurrentStay([WESTIN, next], "2026-10-15")?.name, "Park Hyatt Sydney");
  assert.equal(findCurrentStay([next, WESTIN], "2026-10-14")?.name, "The Westin Melbourne");
});

test("timed events are read in the given timezone", () => {
  const timed = {
    summary: "Stay at Ace Hotel",
    start: { dateTime: "2026-10-11T15:00:00-07:00" },
    end: { dateTime: "2026-10-13T11:00:00-07:00" },
  };
  const s = findCurrentStay([timed], "2026-10-13", "America/Los_Angeles");
  assert.deepEqual(s, {
    name: "Ace Hotel",
    location: null,
    start: "2026-10-11",
    end: "2026-10-13",
  });
  assert.equal(findCurrentStay([timed], "2026-10-14", "America/Los_Angeles"), null);
});

test("no events / non-stays → null", () => {
  assert.equal(findCurrentStay([], "2026-10-12"), null);
  assert.equal(findCurrentStay([{ summary: "Stay at X" }], "2026-10-12"), null); // no dates
});

test("geocode candidates: city first, street lines and postcodes dropped", () => {
  assert.deepEqual(geocodeCandidates(WESTIN.location), ["Melbourne", "The Westin Melbourne"]);
  assert.deepEqual(geocodeCandidates("Hilton, 500 E 4th St, Austin, TX 78701, USA"), [
    "Austin",
    "Hilton",
  ]);
  assert.deepEqual(geocodeCandidates("New York, NY 10001, USA"), ["New York"]);
  assert.deepEqual(geocodeCandidates("Paris, France"), ["Paris"]);
  assert.deepEqual(geocodeCandidates("Kyoto"), ["Kyoto"]);
  assert.deepEqual(geocodeCandidates("  "), []);
  assert.deepEqual(geocodeCandidates(null), []);
});

test("geocode candidates for the address Google Calendar actually writes (live, Oct 2026)", () => {
  // Two segments, the city at the END of a street line. The first version produced no candidates
  // for this, and travel mode silently showed home weather.
  const live = "205 Collins Street Melbourne, Victoria 3000 Australia";
  assert.deepEqual(geocodeCandidates(live), ["Melbourne", "Victoria"]);
  assert.equal(addressCountry(live), "Australia");
  // A street line ending in a suffix contributes nothing.
  assert.deepEqual(geocodeCandidates("12 Main St, Springfield, United States"), ["Springfield"]);
  assert.equal(addressCountry("12 Main St, Springfield, United States"), "United States");
  assert.equal(addressCountry("Kyoto"), null);
});

test("stayCity falls back to the hotel name without a location", () => {
  assert.equal(stayCity({ name: "The Westin Melbourne", location: WESTIN.location }), "Melbourne");
  assert.equal(stayCity({ name: "Ace Hotel", location: null }), "Ace Hotel");
});
