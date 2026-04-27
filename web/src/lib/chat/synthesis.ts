// Loose shape for ToolLoopAgent step results — avoids importing SDK internals
// while still giving the helpers enough type information to work correctly.
type StepLike = {
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    inputTokenDetails?: {
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      noCacheTokens?: number;
    };
  };
  toolCalls?: Array<{ toolCallId: string; toolName: string }>;
  toolResults?: Array<{ toolCallId?: string; output?: unknown }>;
  reasoning?: unknown[];
  reasoningText?: string;
  warnings?: unknown[];
};

export const TOOL_PHRASING: Record<string, [success: string, attempt: string]> = {
  add_task: ["added a task", "add a task"],
  complete_task: ["marked a task complete", "mark a task complete"],
  log_habit: ["logged a habit", "log a habit"],
  update_profile: ["updated your profile", "update your profile"],
  create_calendar_event: ["created a calendar event", "create a calendar event"],
  update_calendar_event: ["updated a calendar event", "update a calendar event"],
  delete_calendar_event: ["deleted a calendar event", "delete a calendar event"],
  assign_workout: ["assigned a workout", "assign a workout"],
  update_workout_exercise: ["updated a workout exercise", "update a workout exercise"],
  cancel_workout: ["cancelled a workout", "cancel a workout"],
  reschedule_workout: ["rescheduled a workout", "reschedule a workout"],
};

export interface CompletedToolStep {
  toolName: string;
  ok: boolean;
  error?: string;
}

export function isToolResultOk(result: unknown): boolean {
  // Mutating tools: explicit { ok: true | false }
  if (result && typeof result === "object" && "ok" in result) {
    return (result as { ok: boolean }).ok === true;
  }
  // Read-only tools: anything without an `error` key counts as ok for the
  // purposes of "did this complete?"
  if (result && typeof result === "object" && "error" in result) return false;
  return true;
}

// Billing-aligned token weight for quota accounting (#457).
// Cache reads are billed at ~10% of normal; cache writes and uncached input
// at 1x; output at 1x. Integer result to match the int DB column.
export function effectiveTokensForQuota(usage: {
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  noCacheTokens?: number;
}): number {
  const output = usage.outputTokens ?? 0;
  const noCache = usage.noCacheTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  return output + noCache + cacheWrite + Math.round(cacheRead / 10);
}

export function synthesizeFallbackSummary(
  steps: CompletedToolStep[],
  flags: { hitStepCap: boolean; budgetExceeded: boolean; aborted: boolean },
): string {
  const succeeded = steps.filter((s) => s.ok && TOOL_PHRASING[s.toolName]);
  const failed = steps.filter((s) => !s.ok && TOOL_PHRASING[s.toolName]);

  const phraseList = (subset: CompletedToolStep[], idx: 0 | 1): string => {
    const counts = new Map<string, number>();
    for (const s of subset) counts.set(s.toolName, (counts.get(s.toolName) ?? 0) + 1);
    const out: string[] = [];
    for (const [name, n] of counts) {
      const phrase = TOOL_PHRASING[name][idx];
      out.push(n > 1 ? `${phrase} (×${n})` : phrase);
    }
    return out.join(", ");
  };

  let body: string;
  if (failed.length === 0 && succeeded.length === 0) {
    body = "I hit a snag generating a response — please try again.";
  } else if (failed.length === 0) {
    body = `Done. I ${phraseList(succeeded, 0)}.`;
  } else if (succeeded.length === 0) {
    const firstError = failed.find((f) => f.error)?.error;
    body = `I tried to ${phraseList(failed, 1)} but it didn't go through${firstError ? ` — ${firstError}` : ""}. Please try again.`;
  } else {
    const firstError = failed.find((f) => f.error)?.error;
    body =
      `Partial: I ${phraseList(succeeded, 0)}, but failed to ${phraseList(failed, 1)}` +
      `${firstError ? ` (${firstError})` : ""}. Check before retrying the failed parts.`;
  }

  const reason = flags.aborted
    ? " (I ran out of time before finishing — your request may or may not have completed; check before retrying.)"
    : flags.budgetExceeded
      ? " (Hit my token budget before I could write a longer summary — let me know if you need detail.)"
      : flags.hitStepCap
        ? ' (Hit my 20-step turn limit — this task has more work remaining. Reply **"continue"** and I\'ll pick up where I left off.)'
        : "";
  return body + reason;
}

// Pairs tool calls with their results from all agent steps.
// Distinguishes "tool ran and succeeded" from "tool ran and failed" — the
// bug #319 fix for the synthesizer claiming success from toolCalls alone.
export function extractCompletedSteps(steps: StepLike[]): CompletedToolStep[] {
  const allCalls = steps.flatMap((s) => s.toolCalls ?? []);
  const allResults = steps.flatMap((s) => s.toolResults ?? []);
  const resultByCallId = new Map<string, unknown>();
  for (const r of allResults) {
    const callId = (r as { toolCallId?: string }).toolCallId;
    // v5 renamed tool result payload: .result → .output
    if (callId) resultByCallId.set(callId, (r as { output?: unknown }).output);
  }
  const completedSteps: CompletedToolStep[] = [];
  for (const call of allCalls) {
    const result = resultByCallId.get(call.toolCallId);
    const ok = result === undefined ? false : isToolResultOk(result);
    const error =
      result && typeof result === "object" && "error" in result
        ? String((result as { error?: unknown }).error)
        : undefined;
    completedSteps.push({ toolName: call.toolName, ok, error });
  }
  return completedSteps;
}

// Sums prompt-cache and reasoning telemetry across all steps; merges
// per-step warnings with any top-level warnings from onFinish.
export function computeCacheMetrics(
  steps: StepLike[],
  topLevelWarnings?: unknown[],
): {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  noCacheTokens: number;
  reasoningParts: number;
  reasoningChars: number;
  allWarnings: unknown[];
} {
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let noCacheTokens = 0;
  let reasoningParts = 0;
  let reasoningChars = 0;
  for (const s of steps) {
    cacheReadTokens += s.usage?.inputTokenDetails?.cacheReadTokens ?? 0;
    cacheWriteTokens += s.usage?.inputTokenDetails?.cacheWriteTokens ?? 0;
    noCacheTokens += s.usage?.inputTokenDetails?.noCacheTokens ?? 0;
    reasoningParts += s.reasoning?.length ?? 0;
    reasoningChars += s.reasoningText?.length ?? 0;
  }
  const stepWarnings = steps.flatMap((s) => s.warnings ?? []);
  const allWarnings = [...(topLevelWarnings ?? []), ...stepWarnings];
  return {
    cacheReadTokens,
    cacheWriteTokens,
    noCacheTokens,
    reasoningParts,
    reasoningChars,
    allWarnings,
  };
}
