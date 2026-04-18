// Per-tool strict-mode gates (AI SDK v6). Flip to false to disable the
// provider-boundary schema gate for a single tool without reverting the PR.
// See #343 — malformed inputs are rejected before execute() runs. The #319
// { ok, error? } runtime contract still applies underneath; strict is
// additive, not a replacement.
export const STRICT_TOOLS = {
  create_calendar_event: true,
  update_calendar_event: true,
  assign_workout: true,
  update_workout_exercise: true,
  update_profile: true,
} as const;

export type StrictToolName = keyof typeof STRICT_TOOLS;
