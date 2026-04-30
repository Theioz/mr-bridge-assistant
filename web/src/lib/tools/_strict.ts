// Per-tool strict-mode gates (AI SDK v6). The { ok, error? } runtime contract
// from #319 remains in force on every mutating tool; strict mode is an earlier
// boundary check, not a replacement.
//
// History (PR #359 → PR #360 → PR #343): enabling all five tools simultaneously
// surfaced three Anthropic constraints:
//   1. Every object schema must set additionalProperties: false.
//   2. Total optional parameters across all strict tools ≤ 24 (documented).
//   3. An undocumented "schema is too complex for compilation" ceiling.
// The schema tightenings from PRs #359/#360 stay. Strict mode is now enabled
// on the four tools whose cumulative optional-param count (≤ 18) fits within
// the empirical budget. assign_workout (~30+ optional params across three
// array-of-objects phases) is left false — it reliably trips the compilation
// ceiling regardless of the 24-param limit.
//
// Empirical optional-param tally (cumulative across enabled tools):
//   update_profile:        0 optional  → cumulative  0  ENABLED
//   create_calendar_event: 5 optional  → cumulative  5  ENABLED
//   update_calendar_event: 5 optional  → cumulative 10  DISABLED (400 at 10 cumulative)
//   update_workout_exercise: 8 optional → cumulative 18  DISABLED (400 at 18 cumulative)
//   assign_workout:        ~30+ optional             DISABLED
//
// Empirical ceiling confirmed: ≤5 cumulative optional params across strict tools is
// safe; 10 cumulative reliably triggers "Schema is too complex for compilation" (400).
// Re-test when Anthropic raises the compilation budget.
export const STRICT_TOOLS = {
  create_calendar_event: true,
  update_calendar_event: false,
  assign_workout: false,
  update_workout_exercise: false,
  update_profile: true,
} as const;

export type StrictToolName = keyof typeof STRICT_TOOLS;
