import type { LanguageModelV3Middleware } from "@ai-sdk/provider";
import type { StopCondition, ToolSet } from "ai";

export const retryOnOverload: LanguageModelV3Middleware = {
  specificationVersion: "v3",
  wrapStream: async ({ doStream }) => {
    for (let attempt = 0; attempt <= 2; attempt++) {
      if (attempt > 0) {
        const delay = attempt * 1500;
        console.log(`[chat] API overloaded, retrying in ${delay}ms (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, delay));
      }
      try {
        return await doStream();
      } catch (err) {
        const isOverloaded =
          err instanceof Error &&
          (err.message.toLowerCase().includes("overload") ||
            (err as { status?: number }).status === 529);
        if (!isOverloaded || attempt === 2) throw err;
      }
    }
    throw new Error("Max retries exceeded");
  },
};

// Stop the tool loop when cumulative token usage across steps exceeds `budget`.
// v6 `stopWhen` accepts an array of predicates composed with OR, so this pairs
// with `stepCountIs` to replace the v4-era hand-rolled cumulativeTokens tally.
//
// Note on prompt caching (#340): usage.inputTokens is the grand total of input
// tokens processed by the model, including cache reads and writes. The budget
// ceiling intentionally protects against runaway context growth, not cost —
// cached reads still count here even though they're billed at ~10%. Do not
// subtract cacheReadTokens from this tally.
// Generic over TOOLS so the predicate composes with a concrete, typed tools
// object in ToolLoopAgent's `stopWhen` (which uses `NoInfer<TOOLS>`). The
// SDK's own helpers (e.g. `stepCountIs`) return `StopCondition<any>` for the
// same reason; we parametrize instead to keep `--no-explicit-any` clean.
export const tokenBudgetExceeds =
  <T extends ToolSet>(budget: number): StopCondition<T> =>
  ({ steps }) => {
    let total = 0;
    for (const s of steps) {
      total += (s.usage?.inputTokens ?? 0) + (s.usage?.outputTokens ?? 0);
    }
    return total > budget;
  };
