// Per-tool strict-mode gates (AI SDK v6). All flags currently disabled
// pending investigation of Anthropic's strict-mode compilation limits
// (see #343). The { ok, error? } runtime contract from #319 remains in
// force on every mutating tool; strict mode is defence-in-depth, not
// the primary guarantee.
//
// History (PR #359 → PR #360): enabling strict on five mutating tools
// surfaced three Anthropic constraints in sequence:
//   1. Every object schema must set additionalProperties: false.
//   2. Total optional parameters across all strict tools ≤ 24.
//   3. An undocumented "schema is too complex for compilation" ceiling
//      that trips even with 15 optional params and tight schemas.
// The schema tightenings stay (they're strict improvements regardless),
// but strict: true is off on every tool until we can test against
// Anthropic's actual compilation budget empirically.
export const STRICT_TOOLS = {
  create_calendar_event: false,
  update_calendar_event: false,
  assign_workout: false,
  update_workout_exercise: false,
  update_profile: false,
} as const;

export type StrictToolName = keyof typeof STRICT_TOOLS;
