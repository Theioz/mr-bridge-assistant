import { tool, jsonSchema } from "ai";
import { todayString } from "@/lib/timezone";
import type { ToolContext } from "./_context";
import {
  logDrink,
  logMeasurement,
  type LogDrinkInput,
  type LogMeasurementInput,
} from "./program-actions.ts";

/**
 * Program-tracking tools: drinks and tape measurements.
 *
 * `log_drink` is a deliberate, narrow exception to "there is no `log_meal` tool" (meals.ts,
 * .claude/rules/data-sources.md). That rule exists because a model's calorie estimate for food is
 * unreliable — so food goes through USDA or a label. A drink is different: its ethanol is pure
 * arithmetic on volume × ABV (lib/nutrition/drinks.ts), and the only other calories are the
 * label's carbs. Nothing here asks the model for a calorie, so the reason for the rule does not
 * apply. It covers alcohol only; food stays out of reach of any tool.
 */
export function buildProgramTools({ supabase, userId }: ToolContext) {
  return {
    log_drink: tool({
      description:
        "Log one alcoholic drink to meal_log (a snack row with standard_drinks set) and mark the " +
        "day's 'No Alcohol' habit not completed. Calories are computed, not estimated: ethanol " +
        "arithmetic on volume_ml × abv_pct (7 kcal/g) plus 4 kcal/g of carbs_g read from a label " +
        "— never pass a model estimate as carbs_g; omit it when there is no label. Standard " +
        "drinks are US (14 g ethanol). Log every drink honestly, one call per drink, without " +
        "commentary or judgement. Returns the computed drinks and kcal.",
      inputSchema: jsonSchema<LogDrinkInput>({
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD. Defaults to today (user timezone)." },
          beverage: { type: "string", description: "What it was, e.g. 'IPA' or 'red wine'." },
          volume_ml: { type: "number", description: "Volume poured, in ml (12 fl oz = 355 ml)." },
          abv_pct: { type: "number", description: "Alcohol by volume, percent (0-100)." },
          carbs_g: {
            type: "number",
            description: "Carbs per serving from the label. Defaults to 0.",
          },
          origin: { type: "string", enum: ["home", "restaurant", "delivery", "travel"] },
          notes: { type: "string" },
        },
        required: ["beverage", "volume_ml", "abv_pct"],
      }),
      execute: async (input) => logDrink(supabase, userId, todayString(), input),
    }),

    log_measurement: tool({
      description:
        "Record a tape measurement in body_measurements — one row per date; re-logging a date " +
        "updates only the fields given. waist_in is inches, measured at the navel.",
      inputSchema: jsonSchema<LogMeasurementInput>({
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD. Defaults to today (user timezone)." },
          waist_in: { type: "number", description: "Waist circumference in inches." },
          notes: { type: "string" },
        },
      }),
      execute: async (input) => logMeasurement(supabase, userId, todayString(), input),
    }),
  };
}
