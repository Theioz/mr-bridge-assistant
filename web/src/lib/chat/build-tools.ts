import type { ToolContext } from "@/lib/tools/_context";
import { buildTasksTools } from "@/lib/tools/tasks";
import { buildHabitsTools } from "@/lib/tools/habits";
import { buildFitnessTools } from "@/lib/tools/fitness";
import { buildProfileTools } from "@/lib/tools/profile";
import { buildGmailTools } from "@/lib/tools/gmail";
import { buildCalendarTools } from "@/lib/tools/calendar";
import { buildMealsTools } from "@/lib/tools/meals";
import { buildSessionTools } from "@/lib/tools/session";
import { buildWorkoutTools } from "@/lib/tools/workouts";
import { buildEquipmentTools } from "@/lib/tools/equipment";
import { buildStocksTools } from "@/lib/tools/stocks";
import { buildSportsTools } from "@/lib/tools/sports";

// Attach an Anthropic ephemeral cache breakpoint to the last entry in a tools
// object. Anthropic caps requests at 4 cache breakpoints total — anchoring one
// marker on the trailing tool caches every tool above it and leaves headroom
// for the system-prompt marker (#340). Non-Anthropic providers ignore the
// provider-scoped `anthropic` key so this is safe to pass through; callers
// should still skip the wrap on the demo path for clarity.
function withTrailingCacheBreakpoint<T extends Record<string, unknown>>(tools: T): T {
  const keys = Object.keys(tools);
  if (keys.length === 0) return tools;
  const lastKey = keys[keys.length - 1];
  const last = tools[lastKey] as {
    providerOptions?: { anthropic?: Record<string, unknown> } & Record<string, unknown>;
  } & Record<string, unknown>;
  const nextLast = {
    ...last,
    providerOptions: {
      ...(last.providerOptions ?? {}),
      anthropic: {
        ...(last.providerOptions?.anthropic ?? {}),
        cacheControl: { type: "ephemeral" as const, ttl: "1h" },
      },
    },
  };
  return { ...tools, [lastKey]: nextLast } as T;
}

// Assembles all domain tool sets and, for real users, attaches the trailing
// Anthropic cache breakpoint (#340). Demo path skips the breakpoint — Groq
// doesn't support prompt caching.
export function buildChatTools(context: ToolContext, isDemo: boolean) {
  const baseTools = {
    ...buildTasksTools(context),
    ...buildHabitsTools(context),
    ...buildFitnessTools(context),
    ...buildProfileTools(context),
    ...buildGmailTools(context),
    ...buildCalendarTools(context),
    ...buildMealsTools(context),
    ...buildSessionTools(context),
    ...buildWorkoutTools(context),
    ...buildEquipmentTools(context),
    ...buildStocksTools(context),
    ...buildSportsTools(context),
  };
  return isDemo ? baseTools : withTrailingCacheBreakpoint(baseTools);
}
