// Per-tool strict-mode gates (AI SDK v6). Flip to false to disable the
// provider-boundary schema gate for a single tool without reverting the PR.
// See #343 — malformed inputs are rejected before execute() runs. The #319
// { ok, error? } runtime contract still applies underneath; strict is
// additive, not a replacement.
//
// Note: Anthropic strict mode imposes a 24-optional-parameter budget
// across all strict tools combined. assign_workout's nested exercise-item
// arrays (3 arrays × 4 optional props each = 12 optional params on top of
// its 5 top-level optional params) alone blows the budget, so it stays
// off until Anthropic raises the cap or we restructure the tool schema.
// The other four strict tools sum to 15 optional params, well under 24.
export const STRICT_TOOLS = {
  create_calendar_event: true,
  update_calendar_event: true,
  assign_workout: false,
  update_workout_exercise: true,
  update_profile: true,
} as const;

export type StrictToolName = keyof typeof STRICT_TOOLS;
