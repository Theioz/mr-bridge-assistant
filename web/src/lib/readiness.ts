// One readiness rule for every surface that shows a readiness score.
//
// WHY THIS EXISTS
//
// On 2026-10-12 the dashboard showed two readiness figures at once: the hero strip said
// "57 · Recovery moderate — moderate effort · Oct 12" and the Health Breakdown below it said
// "53 · low · consider deload · 2026-10-11". Two causes stacked:
//
//   1. Two different rows. The breakdown read the latest row capped to `date < today`; the
//      strip read today's row. Same page, two days, two scores.
//   2. Two copies of the band table, one per component, with different wording and different
//      colour cut-offs (the strip went red under 60, the breakdown accented under 55). They
//      happened to agree on band edges, but nothing kept them agreeing.
//
// The dashboard now reads ONE row (the most recent) and every readiness label on it comes
// from here.

export type ReadinessBand = "optimal" | "good" | "moderate" | "low" | "critical";

export interface ReadinessAdvice {
  band: ReadinessBand;
  /** Short band name, e.g. "moderate". */
  label: string;
  /** What to do about it, e.g. "moderate effort". */
  advice: string;
}

/** Band edges, highest first. A score lands in the first band whose floor it meets. */
const BANDS: { floor: number; band: ReadinessBand; advice: string }[] = [
  { floor: 85, band: "optimal", advice: "push hard today" },
  { floor: 70, band: "good", advice: "normal training" },
  { floor: 55, band: "moderate", advice: "moderate effort" },
  { floor: 40, band: "low", advice: "consider deload" },
  { floor: -Infinity, band: "critical", advice: "rest day recommended" },
];

/** Below this a score is flagged (accent colour). Same edge as the "low" band. */
export const READINESS_FLAG_BELOW = 55;

export function readinessAdvice(score: number | null | undefined): ReadinessAdvice | null {
  if (score == null || Number.isNaN(score)) return null;
  const hit = BANDS.find((b) => score >= b.floor)!;
  return { band: hit.band, label: hit.band, advice: hit.advice };
}

/** "moderate · moderate effort", or "—" with no score. */
export function readinessText(score: number | null | undefined): string {
  const a = readinessAdvice(score);
  return a ? `${a.label} · ${a.advice}` : "—";
}

export function readinessFlagged(score: number | null | undefined): boolean {
  return score != null && score < READINESS_FLAG_BELOW;
}
