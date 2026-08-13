// Regression test for StepList's list markers.
//
// WHY THIS EXISTS
//
// `globals.css` begins with `@import "tailwindcss"`, and Tailwind v4's preflight resets
// `ol, ul { list-style: none }`. A list that does not restate `list-style` renders with NO markers,
// silently — nothing errors, the markup is still a correct `<ol>`, and the component's own doc
// comment can go on claiming "numbered steps" while the page shows none.
//
// That shipped. The recipe method rendered as an undifferentiated run of lines, with the asides
// indistinguishable from the steps, and it took Jason pasting the page back to find it. The defect
// was an ABSENT property, which review does not catch and no type checks — only asserting the
// presence of the declaration does.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  stepListStyle,
  stepTipsStyle,
  stepLegacyStyle,
} from "../components/meals/step-list-styles.ts";

describe("StepList styles survive the Tailwind preflight reset", () => {
  it("numbers the method — the <ol> must ask for decimal explicitly", () => {
    assert.ok(stepListStyle.listStyle, "listStyle must be declared, not left to the browser");
    assert.match(String(stepListStyle.listStyle), /decimal/);
  });

  it("marks asides with discs so they read as subordinate to the numbered steps", () => {
    assert.ok(stepTipsStyle.listStyle, "listStyle must be declared, not left to the browser");
    assert.match(String(stepTipsStyle.listStyle), /disc/);
  });

  it("keeps steps and asides visually distinct", () => {
    // If these ever converge, the method and its footnotes render identically again, which is the
    // exact symptom that was reported.
    assert.notEqual(stepListStyle.listStyle, stepTipsStyle.listStyle);
    assert.notEqual(stepListStyle.color, stepTipsStyle.color);
  });

  it("indents both lists so the markers are not clipped by `outside` positioning", () => {
    // `outside` draws the marker in the padding box. Zero padding hides it just as effectively as
    // `list-style: none`, so the fix is only complete with room to draw it.
    for (const s of [stepListStyle, stepTipsStyle]) {
      assert.ok(s.paddingLeft, "a list using `outside` markers needs left padding");
      assert.notEqual(parseFloat(String(s.paddingLeft)), 0);
    }
  });

  it("leaves the legacy free-text fallback alone", () => {
    // It is a <p>, not a list — it must keep pre-line so stored newlines still break.
    assert.equal(stepLegacyStyle.whiteSpace, "pre-line");
    assert.equal(stepLegacyStyle.listStyle, undefined);
  });
});
