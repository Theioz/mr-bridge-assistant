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
import { buildBacklogTools } from "@/lib/tools/backlog";

/**
 * Assembles every domain tool set.
 *
 * Previously this also stapled an Anthropic ephemeral cache breakpoint onto the
 * trailing tool to keep prompt-cache costs down (#340) — pure Anthropic-billing
 * machinery. With the API gone (#476) there is nothing to cache and nothing to
 * pay for, so the helper went with it. The tools themselves are provider-agnostic
 * and are now consumed by the MCP server (web/mcp/server.ts).
 */
export function buildChatTools(context: ToolContext) {
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
    ...buildBacklogTools(context),
  };
  return baseTools;
}
