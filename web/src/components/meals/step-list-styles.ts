import type { CSSProperties } from "react";

/**
 * Styles for `StepList`, in a plain `.ts` module so a unit test can import them.
 *
 * WHY THEY LIVE HERE. `list-style` must be declared explicitly on every list in this app, never
 * left to the browser default. `globals.css` starts with `@import "tailwindcss"`, and Tailwind v4's
 * preflight resets `ol, ul { list-style: none }`. A list that does not restate it renders with no
 * markers at all — silently, because nothing errors and the markup is still a correct `<ol>`.
 *
 * That is the bug this file was split out to prevent recurring. `StepList` promised "numbered
 * steps" in its own doc comment and set `<li value={s.step}>` correctly, but its `<ol>` never asked
 * for `decimal`. The method rendered as an undifferentiated run of lines, indistinguishable from
 * its own tips — which is how it reached Jason. `IngredientList` escaped only because it happens to
 * declare `listStyle: "disc outside"`.
 *
 * The defect was an ABSENT property. Only a test asserting its presence can catch that, and the
 * test runner cannot import a `.tsx` file, so the constants have to be reachable from here.
 */

export const stepListStyle: CSSProperties = {
  fontSize: "var(--t-meta)",
  color: "var(--color-text)",
  lineHeight: 1.6,
  listStyle: "decimal outside",
  paddingLeft: "1.3em",
  margin: 0,
};

export const stepDurationStyle: CSSProperties = { color: "var(--color-text-muted)" };

/** Asides under a step: muted, and disc-marked so they read as subordinate to the numbers. */
export const stepTipsStyle: CSSProperties = {
  listStyle: "disc outside",
  paddingLeft: "1.1em",
  margin: "0.2em 0 0",
  color: "var(--color-text-muted)",
};

export const stepLegacyStyle: CSSProperties = {
  fontSize: "var(--t-meta)",
  color: "var(--color-text)",
  lineHeight: 1.6,
  whiteSpace: "pre-line",
  margin: 0,
};
