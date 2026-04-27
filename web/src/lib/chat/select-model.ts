import type { UIMessage } from "ai";

/** Concatenate all text parts of a UIMessage into a single string.
 * Used for the denormalized `content` snapshot the sidebar preview reads,
 * for the dedup guard, for selectModel's heuristics, and for logging. */
export function extractTextFromParts(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function selectModel(
  messages: UIMessage[],
  modelOverride?: "haiku" | "sonnet" | "auto",
): "haiku" | "sonnet" {
  if (modelOverride === "haiku") return "haiku";
  if (modelOverride === "sonnet") return "sonnet";

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "sonnet";
  const msg = extractTextFromParts(lastUser).toLowerCase().trim();
  if (!msg) return "sonnet";

  // Gate 1: length
  if (msg.length > 280) return "sonnet";

  // Gate 2: sentence count
  const sentences = msg.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length >= 3) return "sonnet";

  // Gate 3: complex keywords
  const complexPatterns = [
    "analyze",
    "analysis",
    "recommend",
    "should i",
    "what should",
    "plan",
    "strategy",
    "help me",
    "best way",
    "optimize",
    "review",
    "compare",
    "versus",
    " vs ",
    "summarize",
    "summary",
    "trend",
    "progress",
    "what do you think",
    "advice",
    "suggest",
    "improve",
    "breakdown",
    "fitness goal",
    "meal plan",
    "workout plan",
    "schedule strategy",
    "is it worth",
    "explain why",
    "set my goal",
    "save my goal",
    "update my goal",
    "set my target",
    "save that",
    "save these",
    "write that to",
    "lock that in",
  ];
  if (complexPatterns.some((p) => msg.includes(p))) return "sonnet";

  // Gate 4: simple command patterns
  const simplePatterns = [
    /add task/,
    /create task/,
    /new task/,
    /complete task/,
    /mark.{0,20}done/,
    /mark.{0,20}complete/,
    /finish task/,
    /log habit/,
    /log.{0,10}meal/,
    /had.{0,30}for (breakfast|lunch|dinner|snack)/,
    /create event/,
    /add event/,
    /schedule.{0,20}at \d/,
    /book.{0,20}at \d/,
    /show.{0,10}tasks/,
    /list.{0,10}tasks/,
    /get.{0,10}tasks/,
    /what.{0,10}tasks/,
    /check habits/,
    /show habits/,
    /get recipes/,
    /find recipes/,
    /what.{0,20}recipes/,
    /my habits today/,
    /what.{0,20}(eat|ate|had).{0,20}today/,
    /today.{0,20}meals/,
    /what.{0,20}weight.{0,20}goal/,
    /what.{0,20}(protein|calorie|macro).{0,20}goal/,
    /show.{0,10}habits/,
    /how.{0,20}habits.{0,20}(today|this week)/,
    /what.{0,10}my.{0,20}goal/,
    /get.{0,10}profile/,
    /log.{0,10}(that|it) as/,
    // Workout read-only lookups
    /show.{0,15}workout/,
    /what.{0,15}(is |are |'s )?my workout/,
    /today.{0,15}workout/,
    /workout.{0,15}today/,
    /show.{0,15}exercises/,
    /what.{0,15}exercises/,
    /list.{0,15}exercises/,
    // Calendar read-only lookups
    /what.{0,20}(on|is|are).{0,15}(schedule|calendar)/,
    /show.{0,10}(schedule|calendar|events)/,
    /list.{0,10}(schedule|calendar|events)/,
    /any events.{0,20}(today|tomorrow|this week)/,
    /schedule (today|tomorrow|this week)/,
    /(today|tomorrow).{0,10}schedule/,
    // Recovery and sleep read-only
    /show.{0,15}recovery/,
    /recovery (score|data|today)/,
    /readiness (score|today)/,
    /sleep (score|data|last night)/,
    /show.{0,15}sleep/,
    /\bhrv\b/,
    // Body stats read-only
    /current weight/,
    /what.{0,10}(is |'s )?my weight/,
    /body (fat|comp)/,
    // Stocks read-only
    /my stocks/,
    /show.{0,10}stocks/,
    /my watchlist/,
    // Sports read-only
    /game scores/,
    /sports scores/,
    /show.{0,10}sports/,
    /any games/,
    // Streak lookups
    /my streak/,
    /what.{0,10}my.{0,10}streak/,
  ];
  if (simplePatterns.some((p) => p.test(msg))) return "haiku";

  return "sonnet";
}
