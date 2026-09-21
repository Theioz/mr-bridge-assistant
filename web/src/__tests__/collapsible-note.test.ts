// Unit tests for the note clamp threshold (lib/note-clamp.ts).
// Run with: node --experimental-strip-types --test src/__tests__/collapsible-note.test.ts
//
// WHY THIS EXISTS
//
// Notes are written long on purpose — they carry the reasoning behind a decision so a later
// session reads it instead of re-deriving it. Truncating them in the DATABASE would throw
// that away, so they are kept whole and clamped in the UI instead.
//
// The threshold is a character count, not a measured height. Measuring needs a layout effect,
// which paints the full note for one frame before collapsing it — the exact flash this is
// meant to prevent. The cost is that the count has to be right at the edges, which is what
// these pin.

import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldClampNote, NOTE_CLAMP_CHARS } from "../lib/note-clamp.ts";

test("a short note renders whole, with no toggle", () => {
  assert.equal(shouldClampNote("Felt easy. Shoulders burning on Superset C."), false);
});

test("the real note from the 2026-09-21 phone report clamps", () => {
  const note =
    "WEEK 1A — RESTART. Jason asked on 2026-09-20 to reset the calendar to Week 1 after 8 weeks " +
    "that moved weight 152.6 -> 153.8 lb. THE LOADS ARE NOT RESET, by his decision: body fat held " +
    "flat while weight held flat (lean preserved) and the pull-up max went 3 -> 5 -> 7.";
  assert.equal(shouldClampNote(note), true);
});

test("empty, null and undefined are never clamped", () => {
  assert.equal(shouldClampNote(""), false);
  assert.equal(shouldClampNote(null), false);
  assert.equal(shouldClampNote(undefined), false);
});

test("whitespace does not push a short note over the threshold", () => {
  assert.equal(shouldClampNote(`   ${"a".repeat(NOTE_CLAMP_CHARS)}   `), false);
});

test("the boundary is exclusive: exactly at the limit still fits", () => {
  assert.equal(shouldClampNote("a".repeat(NOTE_CLAMP_CHARS)), false);
  assert.equal(shouldClampNote("a".repeat(NOTE_CLAMP_CHARS + 1)), true);
});
