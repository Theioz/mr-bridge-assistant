// Unit tests for the "timed step with no heat setting" audit check.
//
// WHY THIS EXISTS
//
// On 2026-08-13 a chili recipe's step 4 read, in full, "Simmer 40 min." Jason set a 40 minute timer
// and walked away, and it burned to the bottom of the pan and dried out. The step was not wrong
// about the time; it never said what to set the burner to, and a thick bean-and-tomato mixture on
// anything above the lowest setting scorches long before 40 minutes.
//
// The failure is mechanically detectable — a duration with no heat cue — which means it should be
// caught by a check rather than by someone ruining dinner. 41 of 72 recipes matched on first run.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { timedStepsMissingHeat, UNATTENDED_FLOOR_MINS } from "../../scripts/audit-recipes.ts";
import type { RecipeStep } from "../lib/types.ts";

const step = (o: Partial<RecipeStep> & { text: string }): RecipeStep => ({ step: 1, ...o });

describe("timedStepsMissingHeat", () => {
  it("catches the exact step that burned the chili", () => {
    const f = timedStepsMissingHeat([step({ text: "Simmer 40 min.", duration_mins: 40 })]);
    assert.equal(f.length, 1);
    assert.match(f[0], /Simmer 40 min/);
  });

  it("accepts the corrected version", () => {
    assert.deepEqual(
      timedStepsMissingHeat([
        step({
          text: "Bring to a bare simmer, then drop to LOW and set the lid on ajar. 40 min. Stir every 10 min.",
          duration_mins: 40,
        }),
      ]),
      [],
    );
  });

  it("does NOT treat simmer, boil or saute as heat cues", () => {
    // They name a target state without saying what to set the burner to. That gap is the bug.
    for (const text of ["Simmer 20 min.", "Boil for 12 min.", "Saute 10 min."]) {
      assert.equal(timedStepsMissingHeat([step({ text, duration_mins: 15 })]).length, 1, text);
    }
  });

  it("accepts an oven temperature as a heat cue", () => {
    assert.deepEqual(
      timedStepsMissingHeat([step({ text: "Roast at 425F for 20 min.", duration_mins: 20 })]),
      [],
    );
    assert.deepEqual(
      timedStepsMissingHeat([step({ text: "Roast at 220C for 25 min.", duration_mins: 25 })]),
      [],
    );
  });

  it("accepts every burner level", () => {
    for (const lvl of ["LOW", "medium", "medium-low", "MEDIUM-HIGH", "high"]) {
      assert.deepEqual(
        timedStepsMissingHeat([step({ text: `${lvl} heat, 10 min.`, duration_mins: 10 })]),
        [],
        lvl,
      );
    }
  });

  it("accepts an explicit off-the-heat instruction", () => {
    // "Fold the lamb in off the heat" is a complete thermal instruction — nothing is cooking.
    assert.deepEqual(
      timedStepsMissingHeat([
        step({ text: "Off the heat, fold the lamb through and rest 5 min.", duration_mins: 5 }),
      ]),
      [],
    );
  });

  it("reads a heat cue out of the tips, not only the step text", () => {
    assert.deepEqual(
      timedStepsMissingHeat([
        step({
          text: "Simmer 40 min.",
          duration_mins: 40,
          tips: ["A bare simmer is the LOW setting on most stoves."],
        }),
      ]),
      [],
    );
  });

  it("exempts steps too short to walk away from", () => {
    // A 2 minute step cannot scorch unattended; flagging it would be noise, and a check that cries
    // wolf gets ignored — which is how the spoon rule decayed twice.
    assert.deepEqual(
      timedStepsMissingHeat([step({ text: "Toss for 2 min.", duration_mins: 2 })]),
      [],
    );
    assert.ok(UNATTENDED_FLOOR_MINS >= 3);
  });

  it("reads an inline duration when duration_mins is absent", () => {
    // Most stored steps carry their time in the prose, not the column.
    assert.equal(timedStepsMissingHeat([step({ text: "Reduce for 15 min." })]).length, 1);
  });

  it("handles a range written inline", () => {
    assert.equal(timedStepsMissingHeat([step({ text: "Cook 12-14 min." })]).length, 1);
  });

  it("ignores untimed steps entirely", () => {
    assert.deepEqual(timedStepsMissingHeat([step({ text: "Portion into 2 containers." })]), []);
    assert.deepEqual(timedStepsMissingHeat(null), []);
  });
});
