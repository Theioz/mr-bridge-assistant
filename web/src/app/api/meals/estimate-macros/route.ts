import { anthropic } from "@ai-sdk/anthropic";
import { Output, ToolLoopAgent } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 20;

const MacroEstimateSchema = z.object({
  food_name: z.string().describe("Cleaned-up name of the dish or food item"),
  meal_type_guess: z
    .enum(["breakfast", "lunch", "dinner", "snack"])
    .describe("Best guess for meal type based on the food"),
  calories: z.number().describe("Estimated total calories for the described portion (integer)"),
  protein_g: z.number().describe("Estimated protein in grams"),
  carbs_g: z.number().describe("Estimated carbohydrates in grams"),
  fat_g: z.number().describe("Estimated fat in grams"),
  fiber_g: z.number().nullable().describe("Estimated dietary fiber in grams, or null if not applicable (e.g. pure fat/oil)"),
  sugar_g: z.number().nullable().describe("Estimated sugar in grams, or null if not applicable (e.g. plain protein/fat)"),
  sodium_mg: z.number().describe("Estimated sodium in milligrams (integer)"),
  confidence: z.enum(["high", "medium", "low"]).describe("Confidence level of the estimate"),
  notes: z.string().describe("Brief caveats, e.g. 'portion size assumed standard serving'"),
});

export type MacroEstimate = z.infer<typeof MacroEstimateSchema>;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    ingredients: string;
    dish_name?: string;
    current_macros?: { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number };
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ingredients = body.ingredients?.trim() ?? "";
  const dishName = body.dish_name?.trim() ?? "";
  if (!ingredients && !dishName) {
    return Response.json({ error: "ingredients or dish_name is required" }, { status: 400 });
  }

  const cm = body.current_macros;
  const hasCurrent = cm && (cm.calories != null || cm.protein_g != null || cm.carbs_g != null || cm.fat_g != null);

  const prompt = hasCurrent && dishName
    ? `A user already logged a meal and now wants to adjust its macros.

Base dish: "${dishName}"
Current macros: ${cm!.calories ?? "?"} cal, P ${cm!.protein_g ?? "?"}g, C ${cm!.carbs_g ?? "?"}g, F ${cm!.fat_g ?? "?"}g

User's modification / additional ingredients:
"${ingredients || "(none — just re-estimate the base dish)"}"

Instructions:
- Treat the user's modification as ADDITIONS or CHANGES to the base dish, not a full replacement
- Start from the current macros and adjust up or down based on what the user added/removed/changed
- If the modification text is vague (e.g. "added some chicken"), assume a reasonable single-serving quantity (e.g. ~3-4oz for chicken)
- Use conservative estimates — do not inflate
- Return the NEW TOTAL macros for the adjusted meal, not just the delta
- Set confidence to "medium" for vague modifications, "high" for specific quantities
- Include what you assumed for the modification in notes`
    : `Estimate the nutritional content of a meal with these ingredients:

"${ingredients || dishName}"

Instructions:
- Use the listed ingredients and quantities to estimate macros
- If quantities are missing, assume a standard single serving
- Use conservative estimates — do not inflate
- Set confidence to "high" if ingredients and quantities are clearly specified
- Set confidence to "low" if ingredients are vague or quantities are absent
- Include any key assumptions in notes`;

  try {
    const agent = new ToolLoopAgent({
      model: anthropic("claude-haiku-4-5-20251001"),
      instructions: "Estimate the nutritional content of meals conservatively and accurately.",
      output: Output.object({ schema: MacroEstimateSchema }),
    });
    const { output } = await agent.generate({
      messages: [{ role: "user", content: prompt }],
    });

    return Response.json(output);
  } catch (err) {
    console.error("[estimate-macros] Claude error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Estimation failed" },
      { status: 500 }
    );
  }
}
